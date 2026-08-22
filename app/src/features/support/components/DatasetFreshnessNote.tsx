import type { DatasetFreshnessNoteEntry } from "@/features/support/services/dataset-freshness";

interface DatasetFreshnessNoteProps {
  notes: DatasetFreshnessNoteEntry[];
}

/**
 * データセット鮮度注記(TICKET-0033 AC-1, AC-2)。
 * 表示中のタブに含まれるデータセットごとに「20XX/XX/XX時点の情報です」の注記を表示する
 * (fetched_at ベース、機械検知可能な範囲の鮮度情報。NFR-62 の目視差分チェックの代替ではない)。
 * `frozen`(更新終了、FR-034 AC-6)のデータセットには、通常の鮮度注記とは別に更新終了の
 * 事実情報のみを追記する(傾向・診断の断定は含めない)。
 */
export function DatasetFreshnessNote({ notes }: DatasetFreshnessNoteProps) {
  if (notes.length === 0) return null;

  return (
    <div role="note" className="flex flex-col gap-2 text-left text-xs text-muted-foreground">
      {notes.map((note) => (
        <div key={note.datasetId}>
          <p>
            {note.datasetTitle}は{note.formattedDate}時点の情報です。
          </p>
          {note.frozen && <p>このデータの更新は終了しています。最新の情報は各リンク先でご確認ください。</p>}
        </div>
      ))}
    </div>
  );
}
