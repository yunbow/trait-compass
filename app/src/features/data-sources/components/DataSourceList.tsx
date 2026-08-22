import { ExternalTextLink } from "@/components/common/ExternalTextLink";
import type { DataSourceListItem } from "@/features/data-sources/services/list-data-sources";

interface DataSourceListProps {
  items: readonly DataSourceListItem[];
}

/**
 * 出典表記(書式「出典: {title}({source_org})、{license}」)を
 * 組み立てる純関数。support/services/facility-display.ts の formatSourceCredit と同じ書式だが、
 * あちらは features/support 内部の関数(共有場所に無い)のため、cross-feature import を避けて
 * data-sources feature 内に同じ書式で自前に定義する。
 */
function formatCredit(item: Pick<DataSourceListItem, "title" | "sourceOrg" | "license">): string {
  return `出典: ${item.title}(${item.sourceOrg})、${item.license}`;
}

/**
 * `fetched_at`(ISO 8601)を「最終取得日」表示用の「20XX/XX/XX」形式に整形する純関数。
 * UTC の年月日をそのまま使う(datasets.fetched_at は UTC で記録されるため、実行環境の
 * タイムゾーンに依存させない。features/support/services/dataset-freshness.ts の
 * formatFetchedAtDate と同じ考え方だが、上と同じ理由で自前に定義する)。
 * 不正な日時文字列の場合は安全側として「不明」を返す。
 */
function formatFetchedAt(fetchedAt: string): string {
  const ms = Date.parse(fetchedAt);
  if (Number.isNaN(ms)) return "不明";

  const date = new Date(ms);
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/** 「掲載データの一覧」の区分ごとの見出し・説明文(page.tsx の「データの区分」節と同一の文言)。 */
const KIND_LABEL: Record<DataSourceListItem["kind"], { heading: string; description: string }> = {
  "open-data": {
    heading: "オープンデータ",
    description: "東京都・区市町村等が機械可読形式で公開しているデータです。",
  },
  "standard-license": {
    heading: "標準利用規約データ",
    description:
      "政府標準利用規約や公共データ利用規約(PDL)など、あらかじめ定められた利用規約に基づき、個別の許諾を得ずに利用できるデータです。",
  },
  "individual-permission": {
    heading: "個別許諾データ",
    description: "自治体等へ個別に問い合わせ、許諾・事実確認を得たうえで独自に整理したデータです。",
  },
};

const KIND_ORDER: Array<DataSourceListItem["kind"]> = ["open-data", "standard-license", "individual-permission"];

/**
 * 個別許諾データ(手動調査データ)のカードのみ、「最終取得日」の直後に有効期限日を表示し、
 * 期限切れの場合はタイトル右にバッジ+補足文を添える(有効期限365日、
 * src/lib/manual-data-expiration.ts、2026-08是正)。透明性ページの趣旨により、期限切れでも
 * 一覧からは削除しない。
 */
function DataSourceCard({ item }: { item: DataSourceListItem }) {
  const isManual = item.kind === "individual-permission";
  return (
    <li className="rounded-lg border border-border bg-card p-4">
      <h4 className="flex items-center gap-2 text-sm font-semibold text-foreground">
        {item.title}
        {isManual && item.isExpired && (
          <span className="rounded-full border border-destructive/40 bg-destructive/10 px-2 py-0.5 text-[11px] font-medium text-destructive">
            有効期限切れ
          </span>
        )}
      </h4>
      <p className="mt-1 text-xs text-muted-foreground">{formatCredit(item)}</p>
      <p className="mt-1 text-xs text-muted-foreground">最終取得日: {formatFetchedAt(item.fetchedAt)}</p>
      {isManual && (
        <p className="mt-1 text-xs text-muted-foreground">
          有効期限: {item.expiresAt ? formatFetchedAt(item.expiresAt) : "不明"}
        </p>
      )}
      {isManual && item.isExpired && (
        <p className="mt-1 text-xs text-muted-foreground">有効期限を過ぎているため、検索結果には表示していません。</p>
      )}
      {item.sourceUrl && (
        <p className="mt-1 text-xs">
          <ExternalTextLink href={item.sourceUrl}>データセットを見る</ExternalTextLink>
        </p>
      )}
      {item.categories.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-1">
          {item.categories.map((category) => (
            <li key={category.categoryType}>
              <span className="inline-block rounded-full border border-border px-2 py-0.5 text-[11px] text-muted-foreground">
                {category.categoryType} {category.count}件
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

/**
 * 「利用しているデータ」一覧の本体(TICKET-0065、区分別セクション分けは TICKET-0065 追補)。
 * data-sources/page.tsx から結合済みデータを受け取って描画するだけのプレゼンテーション部品に
 * する(page.tsx はデータパススルーのみ)。
 *
 * 「データの区分」節(page.tsx)と同じ「オープンデータ」/「標準利用規約データ」/「個別許諾データ」の
 * 3区分でセクションを分ける。区分は `classifyDataSourceKind`(datasets.ckan_package_id・license の
 * 値)による機械的な判定であり、見た目の分類のための推測は行わない。該当データが0件の区分は
 * 見出しごと隠すのではなく「現在、該当するデータはありません。」と明示する(区分の存在自体を
 * 隠さない)。
 *
 * facilities に紐づく行が無いデータセット(categories が空配列)は用途チップを出さない
 * (裏付けの無い用途を書かない、正直さ優先)。
 */
export function DataSourceList({ items }: DataSourceListProps) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">現在、掲載しているデータはありません。</p>;
  }

  return (
    <div className="flex flex-col gap-6">
      {KIND_ORDER.map((kind) => {
        const kindItems = items.filter((item) => item.kind === kind);
        const { heading, description } = KIND_LABEL[kind];

        return (
          <section key={kind} aria-labelledby={`data-list-${kind}`}>
            <h3 id={`data-list-${kind}`} className="text-sm font-semibold text-foreground">
              {heading}
            </h3>
            <p className="mt-1 text-xs text-muted-foreground">{description}</p>
            {kindItems.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">現在、該当するデータはありません。</p>
            ) : (
              <ul className="mt-2 flex flex-col gap-3">
                {kindItems.map((item) => (
                  <DataSourceCard key={item.id} item={item} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}
