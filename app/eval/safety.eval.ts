// 安全性の定量評価(TICKET-0024 AC-3, NFR-74)。
//
// ①診断表現排除: 禁止語スクリーニング(禁止語リストを
// `src/lib/copy/banned-words.ts` として共通定数化したもの)を、AI 出力サンプル集
// (fixtures/safety-output-samples.json)に適用する。
//
// ②危機介入: `containsCrisisSignal`(`src/features/ai-summary/services/crisis-detection.ts`)の
// 見逃し率を fixtures/crisis-cases.json(危機表現バリエーション + 紛らわしい非危機表現)で
// 計測する。**見逃し(false negative)が1件でもあれば exit 1**(NFR-74: 危機介入ガードは
// 見逃しゼロを優先する)。誤検知(false positive)は警告のみ(誤検知の許容も NFR-74 の方針)。
//
// ③注入検知ガード: `containsPromptInjectionSignal`(`src/lib/ai/injection-detection.ts`, FR-046)の
// 見逃し率を fixtures/injection-cases.json(注入表現バリエーション + 紛らわしい非注入表現)で
// 計測する。**見逃し(false negative)が1件でもあれば exit 1**(NFR-77: 注入検知ガードは
// 危機介入ガード(NFR-74)と同方針で見逃しゼロを優先する)。誤検知(false positive)は警告のみ。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { containsCrisisSignal } from "@/features/ai-summary/services/crisis-detection";
import { containsPromptInjectionSignal } from "@/lib/ai/injection-detection";
import { containsBannedWord } from "@/lib/copy/banned-words";

import { loadThresholds } from "./lib/thresholds";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_SAMPLES_PATH = path.join(HERE, "fixtures", "safety-output-samples.json");
const CRISIS_CASES_PATH = path.join(HERE, "fixtures", "crisis-cases.json");
const INJECTION_CASES_PATH = path.join(HERE, "fixtures", "injection-cases.json");

interface OutputSample {
  id: string;
  description: string;
  text: string;
  expectViolation: boolean;
}

interface CrisisCase {
  id: string;
  text: string;
  isCrisis: boolean;
}

interface InjectionCase {
  id: string;
  text: string;
  isInjection: boolean;
}

interface CaseOutcome {
  id: string;
  text: string;
}

export interface SafetyEvalResult {
  passed: boolean;
  diagnosticMisses: CaseOutcome[];
  crisisFalseNegatives: CaseOutcome[];
  crisisFalsePositives: CaseOutcome[];
  injectionFalseNegatives: CaseOutcome[];
  injectionFalsePositives: CaseOutcome[];
  markdown: string;
}

function evaluateDiagnosticScreening(samples: OutputSample[]) {
  const misses: CaseOutcome[] = []; // 診断表現があるのに検知できなかった
  const falsePositives: CaseOutcome[] = []; // 診断表現が無いのに誤検知した
  const rows: string[] = [];

  for (const sample of samples) {
    const detected = containsBannedWord(sample.text);
    const isCorrect = detected === sample.expectViolation;
    if (!isCorrect && sample.expectViolation) misses.push(sample);
    if (!isCorrect && !sample.expectViolation) falsePositives.push(sample);
    rows.push(
      `| ${sample.id} | ${sample.description} | ${sample.expectViolation ? "違反サンプル" : "安全サンプル"} | ${detected ? "検知" : "未検知"} | ${isCorrect ? "OK" : "NG"} |`,
    );
  }

  return { misses, falsePositives, rows };
}

function evaluateCrisisDetection(cases: CrisisCase[]) {
  const falseNegatives: CaseOutcome[] = []; // 危機表現なのに見逃した(最重要ゲート)
  const falsePositives: CaseOutcome[] = []; // 非危機なのに誤検知した(警告のみ)
  const rows: string[] = [];

  for (const c of cases) {
    const detected = containsCrisisSignal(c.text);
    const isCorrect = detected === c.isCrisis;
    if (!isCorrect && c.isCrisis) falseNegatives.push(c);
    if (!isCorrect && !c.isCrisis) falsePositives.push(c);
    rows.push(`| ${c.id} | ${c.text} | ${c.isCrisis ? "危機表現" : "非危機"} | ${detected ? "検知" : "未検知"} | ${isCorrect ? "OK" : "NG"} |`);
  }

  return { falseNegatives, falsePositives, rows };
}

function evaluateInjectionDetection(cases: InjectionCase[]) {
  const falseNegatives: CaseOutcome[] = []; // 注入表現なのに見逃した(最重要ゲート)
  const falsePositives: CaseOutcome[] = []; // 非注入なのに誤検知した(警告のみ)
  const rows: string[] = [];

  for (const c of cases) {
    const detected = containsPromptInjectionSignal(c.text);
    const isCorrect = detected === c.isInjection;
    if (!isCorrect && c.isInjection) falseNegatives.push(c);
    if (!isCorrect && !c.isInjection) falsePositives.push(c);
    rows.push(
      `| ${c.id} | ${c.text} | ${c.isInjection ? "注入表現" : "非注入"} | ${detected ? "検知" : "未検知"} | ${isCorrect ? "OK" : "NG"} |`,
    );
  }

  return { falseNegatives, falsePositives, rows };
}

export async function run(): Promise<SafetyEvalResult> {
  const outputSamples = JSON.parse(readFileSync(OUTPUT_SAMPLES_PATH, "utf8")) as OutputSample[];
  const crisisCases = JSON.parse(readFileSync(CRISIS_CASES_PATH, "utf8")) as CrisisCase[];
  const injectionCases = JSON.parse(readFileSync(INJECTION_CASES_PATH, "utf8")) as InjectionCase[];
  const thresholds = loadThresholds().safety;

  const diagnostic = evaluateDiagnosticScreening(outputSamples);
  const crisis = evaluateCrisisDetection(crisisCases);
  const injection = evaluateInjectionDetection(injectionCases);

  const diagnosticPassed = diagnostic.misses.length <= thresholds.diagnosticLanguageMissesMax;
  const crisisPassed = crisis.falseNegatives.length <= thresholds.crisisFalseNegativesMax;
  const injectionPassed = injection.falseNegatives.length <= thresholds.injectionFalseNegativesMax;
  const passed = diagnosticPassed && crisisPassed && injectionPassed;

  const markdown = `## 安全性(診断表現排除・危機介入ガード・注入検知ガード)

### ① 診断表現排除(禁止語スクリーニング)

禁止語(\`src/lib/copy/banned-words.ts\` の語彙)を
AI 出力サンプル集に適用する。

- サンプル数: ${outputSamples.length}
- しきい値: 見逃し件数 <= ${thresholds.diagnosticLanguageMissesMax}

| 指標 | 実測値 | 判定 |
| --- | --- | --- |
| 見逃し件数(違反サンプルを未検知) | ${diagnostic.misses.length} | ${diagnosticPassed ? "OK" : "NG"} |
| 誤検知件数(安全サンプルを誤検知) | ${diagnostic.falsePositives.length} | 警告のみ |

| ID | 説明 | ラベル | 検知結果 | 一致 |
| --- | --- | --- | --- | --- |
${diagnostic.rows.join("\n")}

### ② 危機介入ガード(見逃しゼロが必須、NFR-74)

- ケース数: ${crisisCases.length}(危機表現: ${crisisCases.filter((c) => c.isCrisis).length} / 非危機: ${crisisCases.filter((c) => !c.isCrisis).length})
- しきい値: **見逃し(false negative)件数 <= ${thresholds.crisisFalseNegativesMax}(1件でもあれば CI 失敗)**。誤検知(false positive)は警告のみ。

| 指標 | 実測値 | 判定 |
| --- | --- | --- |
| 見逃し件数(FN) | ${crisis.falseNegatives.length} | ${crisisPassed ? "OK" : "NG(ゲート条件を満たさず失敗)"} |
| 誤検知件数(FP) | ${crisis.falsePositives.length} | 警告のみ |

${crisis.falseNegatives.length > 0 ? `**見逃しケース(要対応)**: ${crisis.falseNegatives.map((c) => `${c.id}「${c.text}」`).join(", ")}\n` : ""}${crisis.falsePositives.length > 0 ? `**誤検知ケース(許容・参考)**: ${crisis.falsePositives.map((c) => `${c.id}「${c.text}」`).join(", ")}\n` : ""}
| ID | テキスト | ラベル | 検知結果 | 一致 |
| --- | --- | --- | --- | --- |
${crisis.rows.join("\n")}

### ③ 注入検知ガード(見逃しゼロが必須、NFR-77)

- ケース数: ${injectionCases.length}(注入表現: ${injectionCases.filter((c) => c.isInjection).length} / 非注入: ${injectionCases.filter((c) => !c.isInjection).length})
- しきい値: **見逃し(false negative)件数 <= ${thresholds.injectionFalseNegativesMax}(1件でもあれば CI 失敗)**。誤検知(false positive)は警告のみ。

| 指標 | 実測値 | 判定 |
| --- | --- | --- |
| 見逃し件数(FN) | ${injection.falseNegatives.length} | ${injectionPassed ? "OK" : "NG(ゲート条件を満たさず失敗)"} |
| 誤検知件数(FP) | ${injection.falsePositives.length} | 警告のみ |

${injection.falseNegatives.length > 0 ? `**見逃しケース(要対応)**: ${injection.falseNegatives.map((c) => `${c.id}「${c.text}」`).join(", ")}\n` : ""}${injection.falsePositives.length > 0 ? `**誤検知ケース(許容・参考)**: ${injection.falsePositives.map((c) => `${c.id}「${c.text}」`).join(", ")}\n` : ""}
| ID | テキスト | ラベル | 検知結果 | 一致 |
| --- | --- | --- | --- | --- |
${injection.rows.join("\n")}
`;

  return {
    passed,
    diagnosticMisses: diagnostic.misses,
    crisisFalseNegatives: crisis.falseNegatives,
    crisisFalsePositives: crisis.falsePositives,
    injectionFalseNegatives: injection.falseNegatives,
    injectionFalsePositives: injection.falsePositives,
    markdown,
  };
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const result = await run();
  console.log(result.markdown);
  process.exitCode = result.passed ? 0 : 1;
}
