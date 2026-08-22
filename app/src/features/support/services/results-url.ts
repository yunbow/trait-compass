// 支援情報案内画面のタブ切替リンク組み立て(TICKET-0015, FR-028)。
//
// `?tab=` を切り替える際も、年齢・区市町村・元の年齢選択(ライフステージ)・相談分野タグ(検索条件)は保持したまま遷移する
// 必要があるため、URL 組み立てをここに切り出してユニットテストで担保する。
// tags クエリの読み書きはASCII ID変換(support-tag-url.ts の setSupportTagsParam)に統一する
// (受動的プライバシー対策。日本語の相談分野ラベルをURLに残さない)。

import type { ResultsTab } from "@/features/support/constants/results-tabs";
import type { AgeGroup } from "@/features/support/schema/age-group";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import { setSupportTagsParam } from "@/features/support/services/support-tag-url";

interface SupportQueryParams {
  age?: AgeGroup;
  /** 区市町村の5桁コード。 */
  municipalityCode: string;
  lifestage?: Lifestage | null;
  tags: readonly SupportTag[];
  purposeId?: string | null;
}

/**
 * `/support` 系リンクの共通クエリ(年齢・区市町村・ライフステージ・相談分野タグ・目的)を
 * 一定の順序で組み立てる内部ヘルパー(exportしない)。各 build*Href が個別に query.set を
 * 並べていたため、引継ぎ対象の追加漏れが起きうる状態だったのを一本化した。
 *
 * 重要(プライバシー設計): このヘルパーは**渡された項目しか設定しない**。
 * 検索条件の二重露出を避けるため age/tagsを意図的に載せないビルダーや、tagsのみのビルダーは
 * このヘルパーを使わず個別実装のまま残す。新しい共通クエリ項目を足すときは、
 * 「全ビルダーに自動で伝播させてよいか」をプライバシー観点で必ず判断すること。
 *
 * クエリ順序は age → municipality → lifestage → tags → purpose に統一する
 * (tab など各ビルダー固有の項目は呼び出し側が後ろへ追加する)。
 */
function createSupportQuery(params: SupportQueryParams): URLSearchParams {
  const query = new URLSearchParams();
  if (params.age != null) query.set("age", params.age);
  query.set("municipality", params.municipalityCode);
  if (params.lifestage != null) query.set("lifestage", params.lifestage);
  setSupportTagsParam(query, params.tags);
  if (params.purposeId != null) query.set("purpose", params.purposeId);
  return query;
}

export interface BuildResultsHrefParams {
  age: AgeGroup;
  /** 区市町村の5桁コード。 */
  municipalityCode: string;
  tags: SupportTag[];
  /** 元の年齢選択(ライフステージ)。タブ切替後も /support への「条件を見直す」導線で復元できるよう保持する。 */
  lifestage?: Lifestage | null;
  /**
   * 目的選択画面(`/support/purpose`)で選ばれた目的のID。タブ切替後も想定ルート表示・
   * 「目的: ...」表示(FacilityResultsView の selectedPurposeLabel/supportPathway)が
   * 消えないよう保持する。未指定(そもそも目的を選ばず遷移した場合)は `tab` クエリを
   * 付けるだけで `purpose` クエリ自体を付けない。
   */
  purposeId?: string | null;
}

/**
 * `/support/results` への遷移先 URL を組み立てる純関数(タブリンク用)。
 * 年齢・区市町村・元の年齢選択(ライフステージ)・相談分野タグ・目的IDを引き継ぐ。
 * `tags` が空(=「全般」)の場合は `tags` クエリ自体を付けない(SupportInputForm と同じ方針)。
 */
export function buildResultsHref(params: BuildResultsHrefParams, tab: ResultsTab): string {
  const query = createSupportQuery({
    age: params.age,
    municipalityCode: params.municipalityCode,
    lifestage: params.lifestage,
    tags: params.tags,
    purposeId: params.purposeId,
  });
  query.set("tab", tab);
  return `/support/results?${query.toString()}`;
}

export interface BuildSupportBackHrefParams {
  /** 区市町村の5桁コード。 */
  municipalityCode: string;
  /** 元の年齢選択(ライフステージ)。`age`(child/adult)からは一意に復元できないため別途保持する。 */
  lifestage: Lifestage | null;
  tags: SupportTag[];
}

/**
 * `/support/results` の「条件を見直す」から `/support` への戻りリンクを組み立てる純関数。
 * 区市町村・年齢(ライフステージ)・相談分野タグを引き継ぎ、`/support` 側の
 * `SupportInputForm` が選択済み状態を復元できるようにする(`supportInputMemoryEnabled` 設定に関わらず
 * 常に機能する。localStorageベースの永続化とは独立した仕組み)。
 */
export function buildSupportBackHref(params: BuildSupportBackHrefParams): string {
  const query = createSupportQuery({
    municipalityCode: params.municipalityCode,
    lifestage: params.lifestage,
    tags: params.tags,
  });
  return `/support?${query.toString()}`;
}

export interface BuildPrepareHrefParams {
  age: AgeGroup;
  /** 区市町村の5桁コード。 */
  municipalityCode: string;
  tags: SupportTag[];
  /** 元の年齢選択(ライフステージ)。`PreparePanel` 側で5区分ピッカーのプリフィルに使う。 */
  lifestage?: Lifestage | null;
}

/**
 * `/support/results` から `/result/prepare`(相談メモを作る)への遷移先 URL を組み立てる純関数。
 * 年齢・区市町村・相談分野タグ・元の年齢選択(ライフステージ)をクエリで引き継ぎ、`PreparePanel` 側で
 * 年齢・区市町村の再入力を省略できるようにする(`tags` が空の場合はクエリ自体を付けない。他の
 * build*Href と同じ方針)。
 */
export function buildPrepareHref(params: BuildPrepareHrefParams): string {
  const query = createSupportQuery({
    age: params.age,
    municipalityCode: params.municipalityCode,
    lifestage: params.lifestage,
    tags: params.tags,
  });
  return `/result/prepare?${query.toString()}`;
}

export interface BuildRecommendHrefParams {
  age: AgeGroup;
  /** 区市町村の5桁コード。 */
  municipalityCode: string;
  tags: SupportTag[];
  /** 検索結果へ戻る際に、選択した年齢区分を復元するため保持する。 */
  lifestage?: Lifestage | null;
  /** 検索結果へ戻る際に、選んだ相談目的を復元するため保持する。 */
  purposeId?: string | null;
}

/**
 * `/support/results` から `/result/recommend`(相談先のヒントを見る)への遷移先 URL を組み立てる
 * 純関数。年齢・区市町村・相談分野タグをクエリで引き継ぎ、`RecommendHintSection` 側で年齢・区市町村の
 * 再入力を省略できるようにする(相談内容の自由記述だけは引き継げないため、そこだけは引き続き入力が必要)。
 * `tags` が空の場合はクエリ自体を付けない(他の build*Href と同じ方針)。
 */
export function buildRecommendHref(params: BuildRecommendHrefParams): string {
  const query = createSupportQuery({
    age: params.age,
    municipalityCode: params.municipalityCode,
    lifestage: params.lifestage,
    tags: params.tags,
    purposeId: params.purposeId,
  });
  return `/result/recommend?${query.toString()}`;
}

export interface BuildPurposeHrefParams {
  age: AgeGroup;
  /** 区市町村の5桁コード。 */
  municipalityCode: string;
  lifestage: Lifestage;
  tags: SupportTag[];
}

/** `/support/purpose` への遷移先URLを組み立て、検索条件を引き継ぐ純関数。 */
export function buildPurposeHref(params: BuildPurposeHrefParams): string {
  const query = createSupportQuery({
    age: params.age,
    municipalityCode: params.municipalityCode,
    lifestage: params.lifestage,
    tags: params.tags,
  });
  return `/support/purpose?${query.toString()}`;
}

export interface BuildPurposeToResultsHrefParams {
  age: AgeGroup;
  /** 区市町村の5桁コード。 */
  municipalityCode: string;
  lifestage: Lifestage;
  tags: SupportTag[];
  purposeId?: string | null;
}

/** `/support/purpose` から `/support/results` へ遷移するURLを組み立てる純関数。 */
export function buildPurposeToResultsHref(params: BuildPurposeToResultsHrefParams): string {
  const query = createSupportQuery({
    age: params.age,
    municipalityCode: params.municipalityCode,
    lifestage: params.lifestage,
    tags: params.tags,
    purposeId: params.purposeId,
  });
  return `/support/results?${query.toString()}`;
}

/** 結果/履歴画面から「地域の相談先を探す」導線で /support へ遷移するURLを組み立てる純関数。tags が空の場合はクエリを付けず /support をそのまま返す(他の build*Href と同じ方針)。 */
export function buildSupportEntryHref(tags: readonly SupportTag[]): string {
  const query = new URLSearchParams();
  setSupportTagsParam(query, tags);
  const search = query.toString();
  return search ? `/support?${search}` : "/support";
}

export interface BuildContentReportGuideHrefParams {
  /** 区市町村の5桁コード。 */
  municipalityCode: string;
  tab: ResultsTab;
  lifestage?: Lifestage | null;
}

/**
 * 結果画面ガイドの訂正・更新報告ページへのURLを組み立てる純関数。
 * 「戻る」の遷移先は SmartBackLink(content-report/page.tsx)がブラウザ履歴から解決するため、
 * ここで検索結果ページの検索条件を back クエリへ埋め込む必要は無い(P0対応)。
 */
export function buildContentReportGuideHref(params: BuildContentReportGuideHrefParams): string {
  const query = new URLSearchParams();
  query.set("targetType", "guide");
  query.set("municipality", params.municipalityCode);
  query.set("tab", params.tab);
  if (params.lifestage != null) {
    query.set("lifestage", params.lifestage);
  }
  return `/support/content-report?${query.toString()}`;
}
