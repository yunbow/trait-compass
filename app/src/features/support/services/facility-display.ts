// リスク区分別の表示切替(TICKET-0015, FR-027)・出典クレジット組み立て(FR-026, NFR-54)の純関数。
//
// D1 アクセスを含まないため、カード描画コンポーネント(FacilityCard)は本ファイルが返す
// 整形済みデータを受け取って描画するだけで済む(レンダリングのテストと純関数のテストを分離)。

import type { ConfirmationStatus, FacilityWithTags } from "@/features/support/services/facility-search";

/** 要約表示(mode="summary")時の説明文の最大文字数。超過分は省略記号で切り詰める。 */
export const SUMMARY_MAX_LENGTH = 60;

/** "full" = 低リスク・全文表示。"summary" = 中〜高リスク・タイトル+要約+外部リンク誘導のみ(FR-027)。 */
export type FacilityDisplayMode = "full" | "summary";

export interface FacilityDisplayData {
  id: string;
  name: string;
  municipality: string;
  categoryType: FacilityWithTags["categoryType"];
  mode: FacilityDisplayMode;
  /** mode="full" の場合のみ値を持つ。summary では住所・電話は表示しない。 */
  address: string | null;
  phone: string | null;
  /** mode="full" は description をそのまま、"summary" は truncateForSummary で切り詰めた値。 */
  summary: string | null;
  url: string | null;
  matchesTags: boolean;
  /** 分類情報。noDiagnosisOk と同様、mode によらず常に引き継ぐ。 */
  facilitySubtype: string | null;
  sourceCredit: string;
  sourceUrl: string | null;
  /**
   * ジオコーディング済みの緯度経度(FR-02A、TICKET-0028)。address・phone と同じく mode="full"
   * (低リスク)の場合のみ値を持つ。中〜高リスク(mode="summary")は住所自体を非表示にしている
   * ため、地図ピンという形で概算位置を露出することも避ける(住所非表示の意図と一貫させる設計判断)。
   */
  lat: number | null;
  lng: number | null;
  /** データセット識別子。鮮度注記(DatasetFreshnessNote)の重複排除キーに使う(TICKET-0033)。 */
  datasetId: string;
  datasetTitle: string;
  /** データセットの取得(fetch)日時(ISO 8601、TICKET-0033 AC-1)。 */
  fetchedAt: string;
  /** true の場合、データセットの更新が終了している(FR-034 AC-6、TICKET-0033 AC-2)。 */
  frozen: boolean;
  /**
   * 「診断がなくても相談できる」フラグ(TICKET-0050)。住所・電話等の事実情報とは異なり
   * 相談可否の性質情報であるため、mode(リスク区分による出し分け、FR-027)によらず
   * 常に引き継ぐ(FacilityCard は mode="summary" でも本フラグのバッジを表示する)。
   */
  noDiagnosisOk: boolean;
  /**
   * 電話以外の連絡手段(TICKET-0051)。値が無い(未取込・空)場合は null であり、mode(リスク
   * 区分)によらずそのまま引き継ぐ(事実情報だが、住所・電話とは異なり相談可否を左右しない
   * 補足情報のため、住所非表示の summary モードでも案内する価値がある。表示側 FacilityCard
   * は電話番号表示の直後に置くため、電話番号自体が非表示の summary では文脈上の混乱を避け、
   * mode="full" の場合のみ表示する)。
   */
  contactMethods: string | null;
  /**
   * 掲載内容の確認状態(migration 0034)。noDiagnosisOk と同様、住所・電話等の事実情報とは
   * 異なる性質情報であり、利用前の注意喚起(FacilityCard)は縮退表示でも有効なため、
   * mode(リスク区分による出し分け、FR-027)によらず常に引き継ぐ。NULL は「未確認」ではなく、
   * CKAN/オープンデータ由来でこの概念自体を持たない施設を表す(混同しないこと)。
   */
  confirmationStatus: ConfirmationStatus | null;
  /** confirmationStatus="confirmed" の場合の確認日(YYYY-MM-DD)。mode によらず常に引き継ぐ。 */
  confirmedOn: string | null;
  /**
   * 想定ルート(SupportPathway)のステップに登場する窓口かどうか(TICKET-未採番、想定ルート
   * 優先表示)。本関数(toFacilityDisplayData)は `FacilityWithTags` 単体からの変換であり
   * 想定ルート情報を知らないため、常に false を返す。想定ルートとの突合・並べ替えは
   * 呼び出し元(page.tsx)が facility-pathway-priority.ts の applyPathwayPriority を通じて
   * 別途行う。
   */
  isPathwayFacility: boolean;
}

/** リスク区分 → 表示モードの対応(FR-027)。低リスクのみ全文、中〜高リスクは要約+外部リンクのみ。 */
export function riskLevelToDisplayMode(riskLevel: "low" | "medium" | "high"): FacilityDisplayMode {
  return riskLevel === "low" ? "full" : "summary";
}

/** 説明文を要約用に切り詰める純関数。`maxLength` 以下ならそのまま返す。 */
export function truncateForSummary(text: string, maxLength: number = SUMMARY_MAX_LENGTH): string {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
}

/**
 * 出典クレジット文字列を組み立てる純関数(FR-026, NFR-54)。
 * 「出典: {データセットタイトル}({source_org})を加工して作成、{license}」の形式に統一する。
 * 「を加工して作成」は、元ページの本文・図表を複製せず事実情報を構造化して掲載している旨を示す
 * 定型句(自治体の個別許諾条件、CC BY表記慣行の双方に対応)。
 */
export function formatSourceCredit(dataset: { datasetTitle: string; sourceOrg: string; license: string }): string {
  return `出典: ${dataset.datasetTitle}(${dataset.sourceOrg})を加工して作成、${dataset.license}`;
}

/**
 * 施設1件を表示用データへ変換する純関数(FR-026, FR-027)。
 * リスク区分に応じて住所・電話・説明文の出し分けを行い、出典クレジットは常に付与する。
 */
export function toFacilityDisplayData(facility: FacilityWithTags): FacilityDisplayData {
  const mode = riskLevelToDisplayMode(facility.riskLevel);

  return {
    id: facility.id,
    name: facility.name,
    municipality: facility.municipality,
    categoryType: facility.categoryType,
    mode,
    address: mode === "full" ? facility.address : null,
    phone: mode === "full" ? facility.phone : null,
    summary:
      facility.description === null
        ? null
        : mode === "full"
          ? facility.description
          : truncateForSummary(facility.description),
    url: facility.url,
    matchesTags: facility.matchesTags,
    facilitySubtype: facility.facilitySubtype,
    sourceCredit: formatSourceCredit(facility),
    sourceUrl: facility.sourceUrl,
    lat: mode === "full" ? facility.lat : null,
    lng: mode === "full" ? facility.lng : null,
    datasetId: facility.datasetId,
    datasetTitle: facility.datasetTitle,
    fetchedAt: facility.fetchedAt,
    frozen: facility.frozen,
    noDiagnosisOk: facility.noDiagnosisOk,
    contactMethods: mode === "full" ? facility.contactMethods : null,
    confirmationStatus: facility.confirmationStatus,
    confirmedOn: facility.confirmedOn,
    isPathwayFacility: false,
  };
}

/**
 * confirmedOn(`YYYY-MM-DD`)を「YYYY年M月D日」形式に整形する純関数(FacilityCompareView の
 * 「情報の確認状態」行で使用)。dataset-freshness.ts の formatFetchedAtDate とは異なり、
 * 不正な形式の場合は「不明」に潰さずそのまま返す(confirmedOn は鮮度注記ではなく確認状態の
 * 補足情報であり、元の値を隠さない方が安全側のため)。
 */
export function formatConfirmedOnDate(confirmedOn: string): string {
  const match = confirmedOn.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return confirmedOn;
  const [, year, month, day] = match;
  return `${year}年${Number(month)}月${Number(day)}日`;
}
