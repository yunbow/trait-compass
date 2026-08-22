// 制度共通の定型質問(TICKET-0048)向け、低リスクデータの解説文層アクセス。
//
// 「施設固有の質問は D1 由来の事実情報のみ、制度共通の質問は低リスクデータの解説文層」という
// 実装方針(TICKET-0048 技術的詳細 §2)に基づき、リスク区分 low(全文投入可、FR-033)の
// facilities(category_type が「支援制度」「福祉ガイド」「発達障害支援資料」)の description を
// 根拠データとして扱う。新しい「解説文」専用テーブルは設けず、既存の facilities/datasets の
// リスク区分出し分け(licenseClassifier.ts、embed-pipeline.ts の `WHERE risk_level = 'low'`)を
// そのまま再利用する(TICKET-0049 の出し分け方針と一貫させる)。
//
// TICKET-0049(RAGナレッジ拡充)で hattatsu.go.jp 等の低リスクデータが追加された場合も、
// 本クエリの `risk_level = 'low'` フィルタにそのまま乗る(新規データセット追加時にコード変更不要)。
// 現時点(TICKET-0049 実装時点)では hattatsu.go.jp の実データ投入は未実施のため、既存の
// 都オープンデータ(cc-by-4.0、risk_level='low')のみが対象になる(AC-4 のグレースフルフォールバック
// が実質的に働く状態)。
//
// **データソースの優先順位付け(TICKET-0049 実装方針 §5)**: 解説文層の主軸を hattatsu.go.jp
// (国立障害者リハビリテーションセンター、国データ)に据える方針のため、`KNOWLEDGE_SOURCE_PRIORITY`
// に列挙した source_org を優先して根拠に採用する。`explain/services/category-evidence.ts`
// (fact-checked 質問文由来、別ドメインの根拠)ではなく、本ファイル(TICKET-0048 で新設した
// 制度共通の質問の RAG 根拠抽出ロジックそのもの)に優先順位付けを持たせた(作業ログ参照)。
// SQL の `ORDER BY` に優先順位を組み込むことで、`LIMIT` 適用後に優先データが漏れ落ちない
// ようにする(取得後に JS でソートするだけでは LIMIT の外側にある優先データを拾えないため)。

import type { D1Database } from "@cloudflare/workers-types";

/**
 * 優先して根拠に採用するデータソース(datasets.source_org)。先頭ほど優先度が高い。
 * hattatsu.go.jp(国立障害者リハビリテーションセンター)を最優先とする
 * (workers/ingest/datasets.config.ts の ds-hattatsu-shien-center と対応)。
 */
export const KNOWLEDGE_SOURCE_PRIORITY: readonly string[] = ["国立障害者リハビリテーションセンター"];

/**
 * `KNOWLEDGE_SOURCE_PRIORITY` から SQL の `ORDER BY` に使う `CASE WHEN` 式を組み立てる純関数
 * (D1 アクセスを含まないためユニットテスト可能)。`?` プレースホルダーは呼び出し側が
 * `KNOWLEDGE_SOURCE_PRIORITY` の値をそのまま `bind()` する前提(値をSQL文字列へ直接埋め込まない、
 * security.md の方針)。優先リストが空の場合は常に同順位になる式を返す。
 */
export function buildSourcePriorityCaseSql(priority: readonly string[]): string {
  if (priority.length === 0) return "0";
  const whenClauses = priority.map(() => `WHEN d.source_org = ? THEN 0`).join(" ");
  return `CASE ${whenClauses} ELSE 1 END`;
}

export interface InstitutionKnowledgeRow {
  name: string;
  description: string;
  datasetTitle: string;
  sourceOrg: string;
  license: string;
  sourceUrl: string | null;
}

interface KnowledgeJoinRow {
  name: string;
  description: string | null;
  dataset_title: string;
  source_org: string;
  license: string;
  source_url: string | null;
}

/** 根拠として取得する既定件数(explain/services/category-evidence.ts の既定件数と揃える)。 */
export const DEFAULT_KNOWLEDGE_LIMIT = 3;

/**
 * 低リスク(risk_level='low')かつ「支援制度」「福祉ガイド」「発達障害支援資料」分類の
 * facilities から、説明文(description)を持つ行を取得する(D1 アクセスを伴うため vitest では
 * テストしない。workers/ingest/embed-pipeline.ts の `fetchEmbeddableFacilities` と同じ扱い)。
 */
export async function fetchInstitutionKnowledge(
  db: D1Database,
  limit: number = DEFAULT_KNOWLEDGE_LIMIT,
): Promise<InstitutionKnowledgeRow[]> {
  const priorityCase = buildSourcePriorityCaseSql(KNOWLEDGE_SOURCE_PRIORITY);
  const { results } = await db
    .prepare(
      `SELECT
         f.name AS name,
         f.description AS description,
         d.title AS dataset_title,
         d.source_org AS source_org,
         d.license AS license,
         d.source_url AS source_url
       FROM facilities f
       JOIN datasets d ON d.id = f.dataset_id
       WHERE d.risk_level = 'low'
         AND f.category_type IN ('支援制度', '福祉ガイド', '発達障害支援資料')
         AND f.description IS NOT NULL
       ORDER BY ${priorityCase}, f.name
       LIMIT ?`,
    )
    .bind(...KNOWLEDGE_SOURCE_PRIORITY, limit)
    .all<KnowledgeJoinRow>();

  return (results ?? [])
    .filter((row): row is KnowledgeJoinRow & { description: string } => row.description !== null)
    .map((row) => ({
      name: row.name,
      description: row.description,
      datasetTitle: row.dataset_title,
      sourceOrg: row.source_org,
      license: row.license,
      sourceUrl: row.source_url,
    }));
}
