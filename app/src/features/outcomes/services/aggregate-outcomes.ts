// 「Trait Compass の成果」ページ(/outcomes)の集計サービス。
//
// D1 アクセス(fetchXxx)と集計ロジック(純関数)を分離し、後者を D1 なしでユニットテストする
// (coverage/services/aggregate-coverage.ts・data-sources/services/list-data-sources.ts と
// 同じ方針、project-structure.md §7「services/ はドメインロジック」)。
//
// 最重要原則(実データの裏付けが無い数値は絶対に表示しない)を守るため、本モジュールは
// 「回答が1件も無い」「コメントが1件も無い」場合を例外扱いせず、常に0件/nullを機械的に返す
// (呼び出し側のコンポーネントが空状態を判定する)。
//
// 「利用者の声」(feedback_comments)は published=1 AND publish_consent=1 の行のみを画面に
// 出してよいという不変条件がある(公開許可のないコメントを絶対に表示してはならない)。
// この不変条件は SQL の WHERE 句(fetchPublishedFeedbackComments)と、アプリ側の純関数
// (selectPublishedComments)の二重で保証する(将来どちらかの実装が変わっても、もう一方が
// 歯止めになるようにするための意図的な冗長化)。

import type { D1Database } from "@cloudflare/workers-types";

// ============================================================
// KPI: 「次の行動の手がかり」(feedback_rating_counts)
// ============================================================

export type FeedbackRatingSource = "support-results" | "result-prepare";
export type FeedbackRating = "clear" | "partial" | "unclear";

/** D1 `feedback_rating_counts` 1行分(日付×画面×評価の集計カウンタ)。 */
export interface FeedbackRatingCountRow {
  date: string;
  source: FeedbackRatingSource;
  rating: FeedbackRating;
  count: number;
}

export interface KpiSummary {
  /** feedback_rating_counts 全体の SUM(count)(回答数、n)。 */
  totalResponses: number;
  /** rating が clear または partial の SUM(count)。 */
  clearOrPartialCount: number;
  /**
   * clearOrPartialCount / totalResponses の整数%(Math.round)。
   * totalResponses=0 の場合は算出不能として null(小数点表示・0件時の捏造率の禁止、
   * コピーガイドライン§7)。
   */
  clearOrPartialPercentage: number | null;
  /** 集計期間の開始表示用(最古の date)。totalResponses=0 の場合は null。 */
  earliestDate: string | null;
}

/**
 * feedback_rating_counts の生データから KPI サマリーを算出する純関数。
 * count<=0 の行(実運用では発生しない想定だが、0件行が紛れても無視できるよう防御的に扱う)は
 * 集計対象から除外する。
 */
export function aggregateKpiSummary(rows: readonly FeedbackRatingCountRow[]): KpiSummary {
  let totalResponses = 0;
  let clearOrPartialCount = 0;
  let earliestDate: string | null = null;

  for (const row of rows) {
    if (row.count <= 0) continue;
    totalResponses += row.count;
    if (row.rating === "clear" || row.rating === "partial") {
      clearOrPartialCount += row.count;
    }
    if (earliestDate === null || row.date < earliestDate) {
      earliestDate = row.date;
    }
  }

  return {
    totalResponses,
    clearOrPartialCount,
    clearOrPartialPercentage: totalResponses > 0 ? Math.round((clearOrPartialCount / totalResponses) * 100) : null,
    earliestDate,
  };
}

interface FeedbackRatingCountJoinRow {
  date: string;
  source: FeedbackRatingSource;
  rating: FeedbackRating;
  count: number;
}

/** feedback_rating_counts の全行を取得する(集計は aggregateKpiSummary 側の責務)。 */
export async function fetchFeedbackRatingRows(db: D1Database): Promise<FeedbackRatingCountRow[]> {
  const { results } = await db
    .prepare(`SELECT date AS date, source AS source, rating AS rating, count AS count FROM feedback_rating_counts`)
    .all<FeedbackRatingCountJoinRow>();
  return results ?? [];
}

// ---- 「まだ分からない」の理由内訳(補助表示、任意) ----

export type UnclearReason = "facility-fit" | "first-step" | "scheme-diff" | "info-gap" | "other";

/** D1 `feedback_unclear_reason_counts` 1行分。 */
export interface FeedbackUnclearReasonCountRow {
  date: string;
  reason: UnclearReason;
  count: number;
}

export interface UnclearReasonSummary {
  reason: UnclearReason;
  count: number;
}

/** 理由別の合計件数を、件数の多い順に並べて返す純関数。count=0 の理由は結果に含めない。 */
export function aggregateUnclearReasonBreakdown(
  rows: readonly FeedbackUnclearReasonCountRow[],
): UnclearReasonSummary[] {
  const totals = new Map<UnclearReason, number>();
  for (const row of rows) {
    if (row.count <= 0) continue;
    totals.set(row.reason, (totals.get(row.reason) ?? 0) + row.count);
  }
  return [...totals.entries()]
    .map(([reason, count]) => ({ reason, count }))
    .sort((a, b) => b.count - a.count);
}

interface FeedbackUnclearReasonCountJoinRow {
  date: string;
  reason: UnclearReason;
  count: number;
}

/** feedback_unclear_reason_counts の全行を取得する。 */
export async function fetchUnclearReasonRows(db: D1Database): Promise<FeedbackUnclearReasonCountRow[]> {
  const { results } = await db
    .prepare(`SELECT date AS date, reason AS reason, count AS count FROM feedback_unclear_reason_counts`)
    .all<FeedbackUnclearReasonCountJoinRow>();
  return results ?? [];
}

// ============================================================
// 橋渡し(補助指標): 「支援情報への橋渡し」(usage_counts)
// ============================================================

/** D1 `usage_counts` 1行分(このページで使う2画面分のみ)。 */
export interface UsageCountRow {
  date: string;
  screen: string;
  count: number;
}

export interface BridgeSummary {
  /** support-results(支援情報一覧)画面の延べ到達数(同じ方の複数回閲覧を含む)。 */
  supportResultsTotal: number;
  /** result-prepare(相談メモ)画面の延べ到達数(同じ方の複数回閲覧を含む)。 */
  resultPrepareTotal: number;
}

/** usage_counts の生データから、支援情報一覧・相談メモの延べ到達数を合計する純関数。 */
export function aggregateBridgeSummary(rows: readonly UsageCountRow[]): BridgeSummary {
  let supportResultsTotal = 0;
  let resultPrepareTotal = 0;
  for (const row of rows) {
    if (row.count <= 0) continue;
    if (row.screen === "support-results") {
      supportResultsTotal += row.count;
    } else if (row.screen === "result-prepare") {
      resultPrepareTotal += row.count;
    }
  }
  return { supportResultsTotal, resultPrepareTotal };
}

interface UsageCountJoinRow {
  date: string;
  screen: string;
  count: number;
}

/** usage_counts のうち support-results・result-prepare の2画面分のみを取得する。 */
export async function fetchBridgeUsageRows(db: D1Database): Promise<UsageCountRow[]> {
  const { results } = await db
    .prepare(
      `SELECT date AS date, screen AS screen, count AS count
       FROM usage_counts
       WHERE screen IN ('support-results', 'result-prepare')`,
    )
    .all<UsageCountJoinRow>();
  return results ?? [];
}

// ============================================================
// 利用者の声(feedback_comments)
// ============================================================

/** feedback_comments 1行分(公開判定に必要な列のみ)。 */
export interface RawFeedbackCommentRow {
  id: string;
  createdDate: string;
  commentText: string;
  publishConsent: boolean;
  published: boolean;
}

/** 画面に表示してよい(公開許可済みの)コメント1件分。 */
export interface PublishedComment {
  id: string;
  createdDate: string;
  commentText: string;
}

/**
 * published=1 かつ publish_consent=1 の行のみを画面表示用として返す純関数。
 * 片方の条件だけを満たす行(公開フラグはあるが同意が無い、または同意はあるが未公開)は
 * 不変条件違反として必ず除外する。
 */
export function selectPublishedComments(rows: readonly RawFeedbackCommentRow[], limit = 5): PublishedComment[] {
  return rows
    .filter((row) => row.published && row.publishConsent)
    .slice(0, limit)
    .map(({ id, createdDate, commentText }) => ({ id, createdDate, commentText }));
}

interface FeedbackCommentJoinRow {
  id: string;
  created_date: string;
  comment_text: string;
  publish_consent: number;
  published: number;
}

/**
 * feedback_comments から公開可能なコメントを取得する。SQL 側でも
 * `published = 1 AND publish_consent = 1` を条件にする(selectPublishedComments と合わせた
 * 二重防御、モジュール先頭コメント参照)。
 */
export async function fetchPublishedFeedbackComments(
  db: D1Database,
  limit = 5,
): Promise<RawFeedbackCommentRow[]> {
  const { results } = await db
    .prepare(
      `SELECT id AS id, created_date AS created_date, comment_text AS comment_text,
              publish_consent AS publish_consent, published AS published
       FROM feedback_comments
       WHERE published = 1 AND publish_consent = 1
       ORDER BY created_date DESC
       LIMIT ?`,
    )
    .bind(limit)
    .all<FeedbackCommentJoinRow>();

  return (results ?? []).map((row) => ({
    id: row.id,
    createdDate: row.created_date,
    commentText: row.comment_text,
    publishConsent: row.publish_consent === 1,
    published: row.published === 1,
  }));
}

// ============================================================
// サービスの改善と広がり(facility_reports / content_reports)
// ============================================================

export interface ReportStatusCounts {
  /** 受付総件数。 */
  total: number;
  /** うち status='done'(確認・反映済み)件数。 */
  done: number;
}

/** facility_reports・content_reports の集計を合算する純関数。 */
export function combineReportCounts(a: ReportStatusCounts, b: ReportStatusCounts): ReportStatusCounts {
  return { total: a.total + b.total, done: a.done + b.done };
}

interface ReportStatusCountJoinRow {
  total: number;
  done: number;
}

/** facility_reports の受付総件数・確認済み件数を取得する。 */
export async function fetchFacilityReportCounts(db: D1Database): Promise<ReportStatusCounts> {
  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done
       FROM facility_reports`,
    )
    .all<ReportStatusCountJoinRow>();
  const row = results?.[0];
  return { total: row?.total ?? 0, done: row?.done ?? 0 };
}

/** content_reports(相談窓口以外の掲載情報の訂正・更新報告)の受付総件数・確認済み件数を取得する。 */
export async function fetchContentReportCounts(db: D1Database): Promise<ReportStatusCounts> {
  const { results } = await db
    .prepare(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN status = 'done' THEN 1 ELSE 0 END), 0) AS done
       FROM content_reports`,
    )
    .all<ReportStatusCountJoinRow>();
  const row = results?.[0];
  return { total: row?.total ?? 0, done: row?.done ?? 0 };
}

/** 「改善と広がり」セクションの表示に必要な値をまとめた型。 */
export interface ImprovementSummary {
  /** 1件以上データがある区市町村数(coverage/aggregate-coverage.ts の CoverageSummary を再利用)。 */
  municipalitiesWithData: number;
  /** 東京都の区市町村総数(母数、通常62)。 */
  totalMunicipalities: number;
  /** 収録施設の総件数。 */
  totalFacilities: number;
  /** 掲載データセット数(/data-sources の一覧と同じ基準で絞り込んだ件数)。 */
  datasetsCount: number;
  /** 掲載情報の報告受付件数(facility_reports + content_reports)。 */
  reportsTotal: number;
  /** うち確認・反映済み件数(status='done')。 */
  reportsDone: number;
}

/**
 * coverage/data-sources の既存集計結果とレポート集計を「改善と広がり」表示用にまとめる純関数。
 * coverageSummary は CoverageSummary(aggregate-coverage.ts)と構造的に互換な最小限のプロパティ
 * のみを受け取り、outcomes/services から coverage feature の型に直接依存しないようにする。
 */
export function buildImprovementSummary(params: {
  coverageSummary: { municipalitiesWithData: number; totalMunicipalities: number; totalFacilities: number };
  datasetsCount: number;
  reportCounts: ReportStatusCounts;
}): ImprovementSummary {
  return {
    municipalitiesWithData: params.coverageSummary.municipalitiesWithData,
    totalMunicipalities: params.coverageSummary.totalMunicipalities,
    totalFacilities: params.coverageSummary.totalFacilities,
    datasetsCount: params.datasetsCount,
    reportsTotal: params.reportCounts.total,
    reportsDone: params.reportCounts.done,
  };
}
