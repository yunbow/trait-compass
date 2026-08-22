// データセット鮮度注記の組み立て(TICKET-0033 AC-1, AC-2)。
//
// `src/features/support/services/dataset-status.ts` が死活監視・鮮度超過(閾値判定)を扱うのに
// 対し、本ファイルは「画面に表示中のデータセットについて `fetched_at` を利用者向けの日付表示
// (20XX/XX/XX)に整形する」「frozen(更新終了、FR-034 AC-6)データセットを重複なく検出する」
// という表示専用のロジックを純関数として切り出す(NFR-72、D1 アクセスを含まないためユニット
// テストのみで担保できる)。
//
// `DatasetFreshnessNote.tsx` はここで組み立てた `DatasetFreshnessNoteEntry[]` を受け取って
// 描画するだけの純粋な表示コンポーネントとする(project-structure.md の関心分離)。

/** 鮮度注記1件分(データセット単位、重複排除済み)。 */
export interface DatasetFreshnessNoteEntry {
  datasetId: string;
  datasetTitle: string;
  /** `fetched_at` を "20XX/XX/XX" 形式に整形した文字列(不正な日時の場合は "不明")。 */
  formattedDate: string;
  /** true の場合、更新終了データセット(FR-034 AC-6)。 */
  frozen: boolean;
}

/**
 * ISO 8601 の `fetchedAt` を「20XX/XX/XX」形式に整形する純関数(TICKET-0033 AC-1)。
 * UTC の年月日をそのまま使う(datasets.fetched_at は UTC で記録されるため、実行環境の
 * タイムゾーンに依存させない。dataset-status.ts の `computeStaleDays` と同じ方針)。
 * 不正な日時文字列の場合は安全側として「不明」を返す。
 */
export function formatFetchedAtDate(fetchedAt: string): string {
  const ms = Date.parse(fetchedAt);
  if (Number.isNaN(ms)) return "不明";

  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/** {@link buildDatasetFreshnessNotes} の入力1件分。FacilityDisplayData のサブセット。 */
export interface FacilityFreshnessSource {
  datasetId: string;
  datasetTitle: string;
  fetchedAt: string;
  frozen: boolean;
}

/**
 * 画面に表示中の施設一覧から、データセット単位で重複排除した鮮度注記一覧を組み立てる純関数
 * (TICKET-0033 AC-1, AC-2)。同じタブに複数データセット由来の施設が混在する場合でも、
 * データセットごとに1件だけ注記を出す(元の facilities の出現順を維持)。
 */
export function buildDatasetFreshnessNotes(
  facilities: readonly FacilityFreshnessSource[],
): DatasetFreshnessNoteEntry[] {
  const seen = new Map<string, DatasetFreshnessNoteEntry>();

  for (const facility of facilities) {
    if (seen.has(facility.datasetId)) continue;
    seen.set(facility.datasetId, {
      datasetId: facility.datasetId,
      datasetTitle: facility.datasetTitle,
      formattedDate: formatFetchedAtDate(facility.fetchedAt),
      frozen: facility.frozen,
    });
  }

  return [...seen.values()];
}
