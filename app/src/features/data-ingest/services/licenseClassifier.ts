// オープンデータのライセンス区分判定(FR-033)。
//
// 東京都オープンデータカタログ(CKAN)を含む各データセットのライセンス識別子を、
// 「区分 A〜H」(RAG追加データソース調査 §1 由来の呼称)に分類し、
// 全文投入してよいかどうか(`allowed`)を機械的に判定する純関数。
//
// - 区分 A: クリエイティブ・コモンズ 表示 4.0 国際(CC BY 4.0)
// - 区分 F/G: 政府標準利用規約(各版)
//   → A/F/G は低リスクとして全文投入を許可する(FR-033)。
// - 区分 B〜E・H: 上記以外(グレー〜高リスク、ライセンス未指定・未分類を含む)
//   → 個別確認が完了するまで全文投入しない。取込 Worker は datasets のメタ情報のみ記録し、
//     facilities への UPSERT を行わない(workers/ingest/workflow.ts)。

export type LicenseCategory = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export type RiskLevel = "low" | "medium" | "high";

export interface LicenseClassification {
  category: LicenseCategory;
  riskLevel: RiskLevel;
  /** true の場合のみ全文投入(facilities への UPSERT)を許可する(FR-033 の A/F/G)。 */
  allowed: boolean;
  /** 人間向けの表示ラベル(freshness_note 等への埋め込み用)。 */
  label: string;
}

interface KnownLicenseEntry {
  category: LicenseCategory;
  riskLevel: RiskLevel;
  label: string;
}

/**
 * 既知のライセンス識別子 → 区分の対応表。
 *
 * CKAN の `license_id`(またはそれに準ずる自由記述の区分コード。db/schema.sql の
 * `datasets.license` を参照)を key とする。低リスク(A/F/G)に該当するものだけをここに
 * 列挙し、それ以外(表記ゆれ・未確認のライセンスを含む)は既定でグレー〜高リスク扱いにする
 * ことで、「許可リストに載っていないものは投入しない」という安全側のフィルタにする。
 */
const KNOWN_LOW_RISK_LICENSES: Record<string, KnownLicenseEntry> = {
  "cc-by-4.0": {
    category: "A",
    riskLevel: "low",
    label: "クリエイティブ・コモンズ 表示 4.0 国際 (CC BY 4.0)",
  },
  "cc-by": {
    category: "A",
    riskLevel: "low",
    label: "クリエイティブ・コモンズ 表示 (CC BY)",
  },
  "government-standard-terms-2.0": {
    category: "F",
    riskLevel: "low",
    label: "政府標準利用規約(第2.0版)",
  },
  "government-standard-terms-1.0": {
    category: "G",
    riskLevel: "low",
    label: "政府標準利用規約(第1.0版)",
  },
  // TICKET-0049: hattatsu.go.jp(発達障害情報・支援センター、国立障害者リハビリテーション
  // センター運営)で実測確認したライセンス表記(2026-07-13、http://www.rehab.go.jp/agree)。
  // 政府標準利用規約とは名称が異なるが、内閣官房が定める同種の政府オープンデータ標準ライセンス
  // (公共データ利用規約 Public Data License)であり、区分F(政府標準利用規約相当)の低リスクとして扱う。
  "pdl-1.0": {
    category: "F",
    riskLevel: "low",
    label: "公共データ利用規約(第1.0版)",
  },
};

/** ライセンス未指定・不明であることを示す識別子(CKAN の "notspecified" 等)。 */
const UNSPECIFIED_LICENSE_CODES = new Set(["", "notspecified", "none", "no-license", "unknown"]);

function normalizeLicenseCode(licenseCode: string | null | undefined): string {
  return (licenseCode ?? "").trim().toLowerCase();
}

/**
 * ライセンス識別子を区分・リスク・全文投入可否に分類する(FR-033)。
 *
 * 既知の低リスクライセンス(A/F/G)以外はすべて `allowed: false` になる。
 * - ライセンス未指定・不明("notspecified" 等) → 区分 H・risk "high"(NFR-55 の
 *   「規約不在は取り込まない」に対応)
 * - それ以外の未分類のライセンス(表記ゆれ・自治体独自規約等) → 区分 H・risk "medium"
 *   (個別確認により A/F/G 相当と判明する可能性を残すため high にはしない)
 */
export function classifyLicense(licenseCode: string | null | undefined): LicenseClassification {
  const normalized = normalizeLicenseCode(licenseCode);
  const known = KNOWN_LOW_RISK_LICENSES[normalized];
  if (known) {
    return { ...known, allowed: isLowRiskCategory(known.category) };
  }

  if (UNSPECIFIED_LICENSE_CODES.has(normalized)) {
    return {
      category: "H",
      riskLevel: "high",
      allowed: false,
      label: `ライセンス未指定・不明(入力値: "${licenseCode ?? ""}")`,
    };
  }

  return {
    category: "H",
    riskLevel: "medium",
    allowed: false,
    label: `未分類のライセンス(入力値: "${licenseCode ?? ""}")。個別確認が必要`,
  };
}

function isLowRiskCategory(category: LicenseCategory): boolean {
  return category === "A" || category === "F" || category === "G";
}

/** `classifyLicense` の `allowed` のみを取り出すヘルパー(FR-033 のフィルタ関数)。 */
export function isLicenseAllowed(licenseCode: string | null | undefined): boolean {
  return classifyLicense(licenseCode).allowed;
}
