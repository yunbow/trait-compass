// RAG 生成品質の定量評価: Faithfulness(TICKET-0024 AC-2, NFR-73②)。
//
// 「aiNote/要約テキスト内の電話番号・施設名・URL が D1 由来集合に含まれるか」のエンティティ
// 突合により判定する(LLM judge は使わない機械的評価)。判定ロジックは
// `src/features/recommend/services/fact-guard.ts` の `containsFabricatedPhone`(既存)に加え、
// 本チケットで拡張した `containsFabricatedUrl`/`containsFabricatedFacilityName` を流用する。
//
// ケースは fixtures/generation-samples.json(D1 の実施設情報を対象にした mock LLM 出力の
// サンプル + 意図的な捏造サンプル)。ラベル(expectFaithful)と検知結果の一致率を
// 「Faithfulness(検知精度)」として算出する。Answer Relevancy(NFR-73②のもう一方の観点)は
// 意味的な妥当性判断が必要で LLM judge 抜きには機械的に測れないため、本チケットの現段階
// (mock LLM が既定、実 LLM judge 未導入)では対象外とし、eval/README.md に導入時の方針を
// 文書化する(ticket 記載のスコープ)。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  containsFabricatedFacilityName,
  containsFabricatedPhone,
  containsFabricatedUrl,
} from "@/features/recommend/services/fact-guard";

import { queryD1, isD1Available } from "./lib/d1";
import { loadThresholds } from "./lib/thresholds";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SAMPLES_PATH = path.join(HERE, "fixtures", "generation-samples.json");

interface GenerationSample {
  id: string;
  description: string;
  facilityId: string;
  responseText: string;
  expectFaithful: boolean;
}

interface FacilityFactRow {
  id: string;
  name: string;
  phone: string | null;
  url: string | null;
}

function judgeFaithful(sample: GenerationSample, facilities: readonly FacilityFactRow[]): boolean {
  const actual = facilities.find((f) => f.id === sample.facilityId);
  if (!actual) {
    // fixture のミス(存在しない facilityId)。安全側に倒し「不誠実」扱いにする。
    return false;
  }

  const otherNames = facilities.filter((f) => f.id !== actual.id).map((f) => f.name);
  const fabricatedPhone = containsFabricatedPhone(sample.responseText, actual.phone);
  const fabricatedUrl = containsFabricatedUrl(sample.responseText, [actual.url]);
  const fabricatedName = containsFabricatedFacilityName(sample.responseText, actual.name, otherNames);

  return !(fabricatedPhone || fabricatedUrl || fabricatedName);
}

export interface GenerationEvalResult {
  passed: boolean;
  accuracy: number;
  falseNegatives: { id: string; description: string }[];
  falsePositives: { id: string; description: string }[];
  caseCount: number;
  markdown: string;
}

export async function run(): Promise<GenerationEvalResult> {
  const samples = JSON.parse(readFileSync(SAMPLES_PATH, "utf8")) as GenerationSample[];
  const thresholds = loadThresholds().generation;

  if (!isD1Available()) {
    const markdown =
      "## 生成品質(Faithfulness)\n\n" +
      "❌ ローカル D1 に接続できませんでした。`npm run db:migrate:local && npm run db:seed:local:manual` を実行してから再度お試しください。\n";
    return { passed: false, accuracy: 0, falseNegatives: [], falsePositives: [], caseCount: 0, markdown };
  }

  const facilities = queryD1<FacilityFactRow>("SELECT id, name, phone, url FROM facilities");

  const falseNegatives: { id: string; description: string }[] = []; // 捏造なのに検知できなかった(最も危険)
  const falsePositives: { id: string; description: string }[] = []; // 誠実なのに誤検知した(過剰ブロック)
  let correct = 0;

  const rows: string[] = [];
  for (const sample of samples) {
    const judgedFaithful = judgeFaithful(sample, facilities);
    const isCorrect = judgedFaithful === sample.expectFaithful;
    if (isCorrect) correct++;
    if (!isCorrect && sample.expectFaithful === false) falseNegatives.push(sample);
    if (!isCorrect && sample.expectFaithful === true) falsePositives.push(sample);

    rows.push(
      `| ${sample.id} | ${sample.expectFaithful ? "誠実" : "捏造"} | ${judgedFaithful ? "誠実と判定" : "捏造と判定"} | ${isCorrect ? "OK" : "NG"} |`,
    );
  }

  const accuracy = samples.length === 0 ? 0 : correct / samples.length;
  const passed = accuracy >= thresholds.faithfulnessMin && falseNegatives.length === 0;

  const markdown = `## 生成品質(Faithfulness)

Faithfulness = aiNote 相当のテキスト中の電話番号・施設名・URL が D1 由来集合に含まれるかの
エンティティ突合(\`fact-guard.ts\` の \`containsFabricatedPhone\`/\`containsFabricatedUrl\`/\`containsFabricatedFacilityName\`)。
ラベル付きサンプル(誠実 + 意図的な捏造)に対する検知精度を算出する。

- ケース数: ${samples.length}(誠実: ${samples.filter((s) => s.expectFaithful).length} / 捏造: ${samples.filter((s) => !s.expectFaithful).length})
- しきい値: 検知精度 >= ${thresholds.faithfulnessMin}、見逃し(捏造を誠実と誤判定)= 0件

| 指標 | 実測値 | 判定 |
| --- | --- | --- |
| 検知精度 | ${accuracy.toFixed(3)} | ${accuracy >= thresholds.faithfulnessMin ? "OK" : "NG"} |
| 見逃し件数(捏造→誠実と誤判定) | ${falseNegatives.length} | ${falseNegatives.length === 0 ? "OK" : "NG"} |
| 誤検知件数(誠実→捏造と誤判定) | ${falsePositives.length} | 警告のみ |

${falseNegatives.length > 0 ? `**見逃しケース**: ${falseNegatives.map((c) => `${c.id}(${c.description})`).join(", ")}\n` : ""}${falsePositives.length > 0 ? `**誤検知ケース**: ${falsePositives.map((c) => `${c.id}(${c.description})`).join(", ")}\n` : ""}
### ケース別内訳

| ID | ラベル | 判定結果 | 一致 |
| --- | --- | --- | --- |
${rows.join("\n")}
`;

  return { passed, accuracy, falseNegatives, falsePositives, caseCount: samples.length, markdown };
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const result = await run();
  console.log(result.markdown);
  process.exitCode = result.passed ? 0 : 1;
}
