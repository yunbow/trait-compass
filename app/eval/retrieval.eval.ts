// RAG 検索精度の定量評価(TICKET-0024 AC-1, NFR-73①)。
//
// ゴールデンデータは2種類あり、それぞれ役割が異なる(詳細は eval/README.md):
// - 手書き(eval/fixtures/retrieval-golden.json, 12件): 初期シードデータ前提。単一の
//   `expectedFacilityIds` に対する Precision@K/Recall@K/MRR で「意味的ランキング」を検証する
//   (`runHandwritten`)。**このケース・しきい値・挙動は一切変更していない**(後方互換必須)。
// - 生成(eval/fixtures/retrieval-golden.generated.json, `npm run eval:golden:generate` で
//   D1 の実データからスナップショット生成): 全区市町村 × 年齢区分を横断的に網羅し、
//   「ある区市町村で意味的検索が構造的に取りこぼす」問題(2026-08-20 発覚: 千代田区クエリで
//   千代田区の施設が上位10件に0件)を検出するための構造的カバレッジ検証(`runGeneratedGolden`)。
//   正解は `requiredFacilityIds`(同一区市町村内)/`acceptableFacilityIds`(広域窓口)の2層。
//   **初回はしきい値を非ゲート(`passed` 判定に含めない)とし、ベースライン記録専用とする**。
//
// LLM judge は介さない機械的評価(SQL/fixture 由来の正解集合との突合のみ)。
//
// **ベクトル未構築環境でのフォールバック(ticket 記載の方針)**: ローカルの Qdrant/Ollama が
// 起動していない環境(このリポジトリの通常の CI 環境を含む)では、ベクトル検索の代わりに
// タグベース検索経路(`searchFacilities` + `buildFallbackFacilities`。`/api/recommend` の
// グレースフルフォールバックと同じ経路)で評価する。この場合の評価は「タグ優先ソート +
// 構造的フィルタ(医療機関除外・年齢一致・区市町村一致 or 広域)が正しく機能しているか」を
// 測るものであり、自由文クエリに対する意味的な検索精度そのものではない
// (タグ検索は意味的なランキングを行わないため、原理的に測れない)。どちらの経路で評価したかは
// レポートに明記する。

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AgeGroup } from "@/features/support/schema/age-group";
import { searchFacilities } from "@/features/support/services/facility-search";
import { buildFallbackFacilities } from "@/features/recommend/services/facility-recommend";
import { queryFacilityIds } from "@/features/support/services/facility-vector-search";
import type { Embedder } from "@/lib/ai/embedder";
import type { VectorStore } from "@/lib/ai/vector-store";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";

import { createEvalD1 } from "./lib/d1-shim";
import { isD1Available } from "./lib/d1";
import type { RetrievalDeps, RetrievalPath } from "./lib/eval-target";
import { resolveRetrievalDeps } from "./lib/eval-target";
import type { GeneratedGoldenCase } from "./lib/generate-golden";
import {
  meanMunicipalityHitRateAtK,
  meanPrecisionAtK,
  meanRecallAtK,
  meanRecallAtKCapped,
  meanReciprocalRank,
} from "./metrics";
import type { RetrievalCase, TieredRetrievalCase } from "./metrics";
import { loadThresholds } from "./lib/thresholds";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GOLDEN_PATH = path.join(HERE, "fixtures", "retrieval-golden.json");
const GENERATED_GOLDEN_PATH = path.join(HERE, "fixtures", "retrieval-golden.generated.json");

interface GoldenCase {
  id: string;
  description: string;
  query: string;
  tags: SupportTag[];
  ageGroup: AgeGroup;
  municipality: string;
  expectedFacilityIds: string[];
}

/** `retrieveViaTagFallback`/`retrieveViaVectorSearch` が必要とする最小限の入力。手書き・生成の両ゴールデンで共通。 */
interface RetrievalQueryInput {
  query: string;
  tags: SupportTag[];
  ageGroup: AgeGroup;
  municipality: string;
}

/** 評価の headline metric として使う K(thresholds.json の retrieval.precisionAtKMin 等と対応)。 */
const K = 5;
/** `/api/recommend` の RECOMMEND_TOP_K と同じ値(フォールバック経路の返却件数上限)。 */
const RETRIEVAL_TOP_K = 10;

/** タグベース検索経路(本番の `/api/recommend` グレースフルフォールバックと同一のロジック)。 */
async function retrieveViaTagFallback(input: RetrievalQueryInput): Promise<string[]> {
  const db = createEvalD1();
  const searchResult = await searchFacilities(db, {
    ageGroup: input.ageGroup,
    municipality: input.municipality,
    tags: input.tags,
  });
  const facilities = buildFallbackFacilities(searchResult, RETRIEVAL_TOP_K);
  return facilities.map((f) => f.id);
}

/**
 * ベクトル検索経路(本番の `/api/recommend` RAG 経路と同一のロジック)。
 * `embedder`/`vectorStore` は `eval/lib/eval-target.ts` の `resolveRetrievalDeps()` が
 * `EVAL_TARGET` に応じて解決したものを受け取る(ローカル Qdrant/Ollama、または
 * `EVAL_TARGET=production` 時は本番 Vectorize/Workers AI への REST アダプタ)。
 */
async function retrieveViaVectorSearch(
  input: RetrievalQueryInput,
  embedder: Embedder,
  vectorStore: VectorStore,
): Promise<string[]> {
  return queryFacilityIds({ text: input.query, topK: RETRIEVAL_TOP_K }, { embedder, vectorStore });
}

/** `usedPath` に応じて `RetrievalQueryInput` から検索結果(facility_id ランキング)を取得する共通ヘルパー。 */
async function retrieve(input: RetrievalQueryInput, usedPath: RetrievalPath, deps: RetrievalDeps): Promise<string[]> {
  try {
    return usedPath === "tag-fallback"
      ? await retrieveViaTagFallback(input)
      : await retrieveViaVectorSearch(input, deps.embedder as Embedder, deps.vectorStore as VectorStore);
  } catch {
    // 個々のケースで例外(D1/VectorStore の一時的な失敗)が起きても、他ケースの評価は継続する。
    return [];
  }
}

export interface RetrievalEvalResult {
  passed: boolean;
  usedPath: "vector-production" | "vector-local" | "tag-fallback" | "unavailable";
  precisionAtK: number;
  recallAtK: number;
  mrr: number;
  k: number;
  caseCount: number;
  markdown: string;
  /** 生成ゴールデンデータ側の実測値(ファイル未生成等で評価しなかった場合は undefined)。非ゲート。 */
  generated?: {
    caseCount: number;
    precisionAtK: number;
    recallAtKCapped: number;
    municipalityHitRateAtK: number;
  };
}

const pathNoteByPath: Record<RetrievalEvalResult["usedPath"], string> = {
  "vector-production":
    "**⚠️ 本番 Vectorize(`trait-compass-facilities`)/Workers AI(`@cf/baai/bge-m3`)で評価しました** " +
    "(`EVAL_TARGET=production`。Cloudflare REST API 経由でローカル Qdrant/Ollama とは別のベクトル空間に" +
    "直接クエリしています。`/api/recommend` の RAG 経路が実際に使う本番インデックス・埋め込みモデルそのものです)。",
  "vector-local":
    "VectorStore(Qdrant)/Embedder(Ollama)に疎通できたため、ベクトル検索経路(`/api/recommend` の RAG 経路と同一のロジック。" +
    "ただしローカルの Qdrant/Ollama を使うため本番のベクトル空間とは別物)で評価しました。",
  "tag-fallback":
    "VectorStore(Qdrant)/Embedder(Ollama)への疎通が確認できなかったため、タグベース検索経路" +
    "(`searchFacilities` + `buildFallbackFacilities`。`/api/recommend` のグレースフルフォールバックと同一)で評価しました。" +
    "この経路は意味的なランキングを行わないため、自由文クエリへの意味的な検索精度そのものは測れません" +
    "(構造的フィルタ + タグ優先ソートの回帰検知が主目的です)。",
  unavailable: "",
};

/** 手書きゴールデン(retrieval-golden.json, 12件)の評価。既存の挙動・しきい値を一切変更しない。 */
async function runHandwritten(deps: RetrievalDeps, usedPath: RetrievalEvalResult["usedPath"]): Promise<RetrievalEvalResult> {
  const golden = JSON.parse(readFileSync(GOLDEN_PATH, "utf8")) as GoldenCase[];
  const thresholds = loadThresholds().retrieval;

  const cases: (RetrievalCase & { id: string; description: string; rankedIds: string[] })[] = [];
  for (const goldenCase of golden) {
    const rankedIds = await retrieve(goldenCase, usedPath as RetrievalPath, deps);
    cases.push({
      id: goldenCase.id,
      description: goldenCase.description,
      rankedIds,
      relevantIds: new Set(goldenCase.expectedFacilityIds),
    });
  }

  const precision = meanPrecisionAtK(cases, K);
  const recall = meanRecallAtK(cases, K);
  const mrr = meanReciprocalRank(cases);

  const passed = precision >= thresholds.precisionAtKMin && recall >= thresholds.recallAtKMin && mrr >= thresholds.mrrMin;

  const pathNote = pathNoteByPath[usedPath];

  const rows = cases
    .map((c) => {
      const p = meanPrecisionAtK([c], K);
      const r = meanRecallAtK([c], K);
      const rr = meanReciprocalRank([c]);
      return `| ${c.id} | ${p.toFixed(2)} | ${r.toFixed(2)} | ${rr.toFixed(2)} | ${c.rankedIds.slice(0, K).join(", ") || "(なし)"} |`;
    })
    .join("\n");

  const markdown = `## 検索精度① 手書きゴールデン(意味的ランキング検証、Precision@K / Recall@K / MRR)

- 評価経路: **${usedPath}**。${pathNote}
- ケース数: ${golden.length}
- しきい値: Precision@${K} >= ${thresholds.precisionAtKMin}, Recall@${K} >= ${thresholds.recallAtKMin}, MRR >= ${thresholds.mrrMin}

| 指標 | 実測値 | しきい値 | 判定 |
| --- | --- | --- | --- |
| Precision@${K} | ${precision.toFixed(3)} | >= ${thresholds.precisionAtKMin} | ${precision >= thresholds.precisionAtKMin ? "OK" : "NG"} |
| Recall@${K} | ${recall.toFixed(3)} | >= ${thresholds.recallAtKMin} | ${recall >= thresholds.recallAtKMin ? "OK" : "NG"} |
| MRR | ${mrr.toFixed(3)} | >= ${thresholds.mrrMin} | ${mrr >= thresholds.mrrMin ? "OK" : "NG"} |

### ケース別内訳

| ID | P@${K} | R@${K} | RR | 上位${K}件 |
| --- | --- | --- | --- | --- |
${rows}
`;

  return { passed, usedPath, precisionAtK: precision, recallAtK: recall, mrr, k: K, caseCount: golden.length, markdown };
}

interface GeneratedRunResult {
  caseCount: number;
  municipalityCount: number;
  precisionAtK: number;
  recallAtKCapped: number;
  municipalityHitRateAtK: number;
  markdown: string;
}

/**
 * 生成ゴールデン(retrieval-golden.generated.json)の評価。全区市町村 × 年齢区分を横断的に
 * 網羅した構造的カバレッジ検証(「ある区市町村で意味的検索が構造的に取りこぼす」問題の検出が目的)。
 *
 * `npm run eval:golden:generate` が未実行でファイルが存在しない場合は評価をスキップし、
 * その旨をレポートに明記する(`npm run eval` 自体は失敗させない。生成ゴールデンは
 * オプトインのスナップショットであり必須の前提ではないため)。
 *
 * **循環評価のリスクに関する注記**: ここでの正解(requiredFacilityIds/acceptableFacilityIds)は
 * `searchFacilities` と同じ SQL 構造条件(区市町村一致・年齢一致・医療機関/対象外除外・
 * タグ or service_category 一致)から機械的に導出したものであり、`searchFacilities` の
 * フィルタロジックが正しいことを暗黙の前提にしてしまっている。したがって本評価は
 * 「検索結果が正解自治体の施設を含んでいるか(構造的カバレッジ)」を測るものであり、
 * 意味的な検索品質そのもの(自由文クエリとランキングの意味的な妥当性)は測れない
 * (それは手書きゴールデン + 将来の Answer Relevancy LLM judge の役割)。
 */
async function runGeneratedGolden(deps: RetrievalDeps, usedPath: RetrievalEvalResult["usedPath"]): Promise<GeneratedRunResult | null> {
  if (!existsSync(GENERATED_GOLDEN_PATH)) return null;

  const golden = JSON.parse(readFileSync(GENERATED_GOLDEN_PATH, "utf8")) as GeneratedGoldenCase[];
  if (golden.length === 0) return null;

  const thresholds = loadThresholds().retrievalGenerated;

  const precisionCases: RetrievalCase[] = [];
  const recallCases: RetrievalCase[] = [];
  const municipalityCases: TieredRetrievalCase[] = [];

  for (const goldenCase of golden) {
    const rankedIds = await retrieve(goldenCase, usedPath as RetrievalPath, deps);
    const requiredIds = new Set(goldenCase.requiredFacilityIds);
    const acceptableIds = new Set(goldenCase.acceptableFacilityIds);
    const unionIds = new Set([...requiredIds, ...acceptableIds]);

    precisionCases.push({ rankedIds, relevantIds: unionIds });
    recallCases.push({ rankedIds, relevantIds: requiredIds });
    municipalityCases.push({ rankedIds, requiredIds, acceptableIds });
  }

  const precision = meanPrecisionAtK(precisionCases, K);
  const recallCapped = meanRecallAtKCapped(recallCases, K);
  const hitRate = meanMunicipalityHitRateAtK(municipalityCases, RETRIEVAL_TOP_K);
  const municipalityCount = new Set(golden.map((c) => c.municipality)).size;

  const pathNote = pathNoteByPath[usedPath];

  const markdown = `## 検索精度② 生成ゴールデン(自治体網羅・構造的取りこぼし検証、非ゲート・ベースライン記録)

- 評価経路: **${usedPath}**。${pathNote}
- ケース数: ${golden.length}(${municipalityCount}自治体分)
- **このセクションのしきい値は \`passed\` 判定に影響しません**(初回はベースライン記録用。詳細は eval/README.md 参照)。

| 指標 | 実測値 | 参考しきい値(記録のみ) |
| --- | --- | --- |
| Precision@${K}(requiredFacilityIds + acceptableFacilityIds を正解扱い) | ${precision.toFixed(3)} | >= ${thresholds.precisionAtKMin} |
| Recall@${K}(requiredFacilityIds のみ、K でキャップ) | ${recallCapped.toFixed(3)} | >= ${thresholds.recallAtKCappedMin} |
| 自治体ヒット率@${RETRIEVAL_TOP_K}(同一区市町村の施設が上位${RETRIEVAL_TOP_K}件に1件でも含まれるケースの割合) | ${hitRate.toFixed(3)} | >= ${thresholds.municipalityHitRateAtKMin} |
`;

  return {
    caseCount: golden.length,
    municipalityCount,
    precisionAtK: precision,
    recallAtKCapped: recallCapped,
    municipalityHitRateAtK: hitRate,
    markdown,
  };
}

export async function run(): Promise<RetrievalEvalResult> {
  if (!isD1Available()) {
    const markdown =
      "## 検索精度(Precision@K / Recall@K / MRR)\n\n" +
      "❌ ローカル D1 に接続できませんでした。`npm run db:migrate:local && npm run db:seed:local:manual` を実行してから再度お試しください。\n";
    return { passed: false, usedPath: "unavailable", precisionAtK: 0, recallAtK: 0, mrr: 0, k: K, caseCount: 0, markdown };
  }

  const deps = await resolveRetrievalDeps();
  const usedPath: RetrievalEvalResult["usedPath"] = deps.usedPath;

  const handwritten = await runHandwritten(deps, usedPath);
  const generated = await runGeneratedGolden(deps, usedPath);

  const generatedMarkdown =
    generated != null
      ? generated.markdown
      : "## 検索精度② 生成ゴールデン(自治体網羅・構造的取りこぼし検証)\n\n" +
        "ℹ️ `eval/fixtures/retrieval-golden.generated.json` が見つかりませんでした。" +
        "`npm run eval:golden:generate` を実行すると生成されます(非ゲートのため未生成でもこの eval 自体は失敗しません)。\n";

  return {
    ...handwritten,
    markdown: `${handwritten.markdown}\n---\n\n${generatedMarkdown}`,
    generated:
      generated != null
        ? {
            caseCount: generated.caseCount,
            precisionAtK: generated.precisionAtK,
            recallAtKCapped: generated.recallAtKCapped,
            municipalityHitRateAtK: generated.municipalityHitRateAtK,
          }
        : undefined,
  };
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  const result = await run();
  console.log(result.markdown);
  process.exitCode = result.passed ? 0 : 1;
}
