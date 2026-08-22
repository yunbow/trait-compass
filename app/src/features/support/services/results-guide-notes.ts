import type { D1Database } from "@cloudflare/workers-types";

import type { ResultsTab } from "@/features/support/constants/results-tabs";
import { municipalityToCode } from "@/features/support/constants/municipality-codes";

export interface ResultsGuideNoteSource {
  label: string;
  url?: string;
  confirmedOn: string;
}

export interface ResultsGuideNoteData {
  /** 安定ID(results_guide_notes.id)。掲載情報の訂正・更新報告(content-report)が
   *  target_type='guide_note' として保存する際の target_id に使う。 */
  id: string;
  body: string[];
  sources: ResultsGuideNoteSource[];
}

interface ResultsGuideNoteRow {
  id: string;
  body_json: string;
  sources_json: string;
}

/**
 * 支援検索結果画面の「1分でわかるガイド」向け、自治体固有の補足を
 * D1(`results_guide_notes`)から取得する。fetchSupportPathway(support-pathway.ts)と同じく
 * 1クエリのみ発行し、body_json/sources_json はどちらも JSON.parse に失敗した場合は
 * 例外を投げず空配列にフォールバックする。該当データが無い場合は `null` を返す
 * (汎用本文のみで表示する呼び出し元の判断に委ねる)。
 */
export async function fetchResultsGuideNote(
  db: D1Database,
  params: { municipality: string; tab: ResultsTab },
): Promise<ResultsGuideNoteData | null> {
  const municipalityCode = municipalityToCode(params.municipality) ?? "";
  const row = await db
    .prepare("SELECT id, body_json, sources_json FROM results_guide_notes WHERE municipality_code = ? AND tab = ?")
    .bind(municipalityCode, params.tab)
    .first<ResultsGuideNoteRow>();

  if (!row) return null;

  let body: string[] = [];
  try {
    body = JSON.parse(row.body_json) as string[];
  } catch {
    body = [];
  }

  let sources: ResultsGuideNoteSource[] = [];
  try {
    sources = JSON.parse(row.sources_json) as ResultsGuideNoteSource[];
  } catch {
    sources = [];
  }

  return { id: row.id, body, sources };
}
