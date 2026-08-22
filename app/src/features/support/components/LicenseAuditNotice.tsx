import type { LicenseAuditStatus } from "@/features/support/components/SchoolInfoSection";

interface LicenseAuditNoticeProps {
  municipality: string;
  licenseAudit?: LicenseAuditStatus | null;
  /**
   * 手動調査データの有効期限365日(src/lib/manual-data-expiration.ts、2026-08是正)。
   * `isExpired` が true の場合、掲載中扱いだったカテゴリ(PUBLISHED_STATUSES)についても
   * 「有効期限切れのため現在掲載していない」旨を別軸の理由として一覧に追加表示する。
   * `null`/`undefined` の場合(調査対象外自治体・期限内)は追加表示しない。
   */
  manualDataExpiration?: { formattedExpiresAt: string; isExpired: boolean } | null;
}

type LicenseAuditKey = keyof LicenseAuditStatus;

const CATEGORY_LABELS: Record<LicenseAuditKey, string> = {
  schoolClassData: "特別支援学級・特別支援教室の設置状況",
  consultationWindowData: "相談窓口情報",
  zoningData: "都立特別支援学校の通学区域",
  highSchoolData: "都立高校(チャレンジスクール等)の入学案内",
};

const CATEGORY_ORDER: LicenseAuditKey[] = ["schoolClassData", "consultationWindowData", "zoningData", "highSchoolData"];

/**
 * licenseAudit のステータス値のうち、投入・公開可(掲載中扱い)の3値。`not_applicable` は
 * 「そもそも許諾判断の対象外(未調査等)」であり、有効期限切れの追加表示対象には含めない
 * (掲載していたものが期限切れで見えなくなった、という文脈にのみ使うため)。
 */
const PUBLISHED_STATUSES = ["permission_granted", "ccby_replaced"];

/**
 * 掲載を見送っている理由(licenseAudit のステータス値のうち、投入・公開可の3値
 * 〔ccby_replaced/permission_granted/not_applicable〕以外)を、自治体名を差し込んだ
 * 文言として返す。対象外のステータスは `null`(バナーに出さない)。
 */
function reasonMessage(municipality: string, status: string): string | null {
  switch (status) {
    case "permission_pending":
      return `${municipality}への許諾申請中のため、現在掲載していません。`;
    case "ccby_available":
      return "代替データの反映作業中のため、現在掲載していません。";
    case "tokyo_restricted":
      return "東京都提供データのため、今回は掲載対象外としています。";
    case "permission_denied":
      return "掲載許諾が得られなかったため、現在掲載していません。";
    default:
      return null;
  }
}

/**
 * 手動調査データの有効期限切れ(`manualDataExpiration.isExpired`)による追加の非掲載理由を
 * 組み立てる純関数。掲載中扱いだった(PUBLISHED_STATUSES)カテゴリのみを対象とする
 * (2026-08是正: licenseAudit のステータス軸とは別軸の、期限切れという事実軸)。
 */
function expiredMessage(formattedExpiresAt: string): string {
  return `調査データの有効期限(${formattedExpiresAt})を過ぎたため、現在掲載していません。最新の情報は各公式サイトでご確認ください。`;
}

/**
 * この自治体の一部データが `licenseAudit` により非掲載になっている場合、その理由を
 * カテゴリごとに一覧表示するバナー(結果画面の上部、タブに関わらず常に表示)。
 * 全カテゴリが投入・公開可のステータスであれば何も表示しない。
 *
 * `manualDataExpiration.isExpired` が true の場合、掲載中扱いだった(PUBLISHED_STATUSES)
 * カテゴリについても、licenseAudit の理由とは別軸(有効期限365日超過)の非掲載理由を追加表示する
 * (2026-08是正)。表示条件は `items.length > 0 || 期限切れ項目 > 0` に拡張される。
 */
export function LicenseAuditNotice({ municipality, licenseAudit, manualDataExpiration }: LicenseAuditNoticeProps) {
  if (!licenseAudit) return null;

  const items = CATEGORY_ORDER.map((key) => ({ key, message: reasonMessage(municipality, licenseAudit[key]) })).filter(
    (item): item is { key: LicenseAuditKey; message: string } => item.message !== null,
  );

  const expiredItems =
    manualDataExpiration?.isExpired
      ? CATEGORY_ORDER.filter((key) => PUBLISHED_STATUSES.includes(licenseAudit[key])).map((key) => ({
          key: `${key}-expired`,
          label: key,
          message: expiredMessage(manualDataExpiration.formattedExpiresAt),
        }))
      : [];

  if (items.length === 0 && expiredItems.length === 0) return null;

  return (
    <section
      aria-label="掲載状況について"
      className="flex flex-col gap-2 rounded-lg border border-border bg-muted/60 p-4 text-left text-sm text-foreground"
    >
      <p className="font-semibold">この自治体の一部データについて</p>
      <ul className="flex list-disc flex-col gap-1 pl-5 text-muted-foreground">
        {items.map((item) => (
          <li key={item.key}>
            <span className="text-foreground">{CATEGORY_LABELS[item.key]}: </span>
            {item.message}
          </li>
        ))}
        {expiredItems.map((item) => (
          <li key={item.key}>
            <span className="text-foreground">{CATEGORY_LABELS[item.label]}: </span>
            {item.message}
          </li>
        ))}
      </ul>
    </section>
  );
}
