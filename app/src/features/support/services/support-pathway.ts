import type { D1Database } from "@cloudflare/workers-types";

import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import { municipalityToCode } from "@/features/support/constants/municipality-codes";

export interface SupportPathwayStepData {
  order: number;
  title: string;
  actor: string | null;
  contact: string | null;
  isConditional: boolean;
  note: string | null;
}

export interface SupportPathwaySource {
  label: string;
  url?: string;
  confirmedOn: string;
}

export interface SupportPathwayData {
  /** 安定ID(support_pathways.id)。掲載情報の訂正・更新報告(content-report)の再取得キーに使う。 */
  id: string;
  municipality: string;
  lifestage: Lifestage;
  purposeId: string;
  purposeLabel: string;
  status: "confirmed" | "unconfirmed" | "phone_required";
  steps: SupportPathwayStepData[];
  sources: SupportPathwaySource[];
}

interface SupportPathwayRow {
  id: string;
  municipality: string;
  lifestage: Lifestage;
  purpose_id: string;
  purpose_label: string;
  status: SupportPathwayData["status"];
  sources_json: string;
}

interface SupportPathwayStepRow {
  step_order: number;
  title: string;
  actor: string | null;
  contact: string | null;
  is_conditional: number;
  note: string | null;
}

/**
 * ライフステージ×目的の想定ルートを D1(`support_pathways`・`support_pathway_steps`)から
 * 取得する。JSON 集約サブクエリの `ORDER BY` は D1 の SQLite バージョンで未検証のため使わず、
 * pathway 本体→steps 一覧の2クエリに分ける(school-info.ts と異なり、steps は pathway が
 * 見つかった後でないと絞り込めないため直列に実行する)。該当する想定ルートが無い場合は
 * `null` を返す。
 */
const SUPPORT_PATHWAY_ROW_COLUMNS =
  "id, municipality, lifestage, purpose_id, purpose_label, status, sources_json";

/** `SupportPathwayRow` + 別途取得した steps から表示用データを組み立てる共通変換。 */
function toSupportPathwayData(pathwayRow: SupportPathwayRow, stepRows: SupportPathwayStepRow[]): SupportPathwayData {
  let sources: SupportPathwaySource[] = [];
  try {
    sources = JSON.parse(pathwayRow.sources_json) as SupportPathwaySource[];
  } catch {
    sources = [];
  }

  const steps: SupportPathwayStepData[] = stepRows.map((row) => ({
    order: row.step_order,
    title: row.title,
    actor: row.actor,
    contact: row.contact,
    isConditional: row.is_conditional === 1,
    note: row.note,
  }));

  return {
    id: pathwayRow.id,
    municipality: pathwayRow.municipality,
    lifestage: pathwayRow.lifestage,
    purposeId: pathwayRow.purpose_id,
    purposeLabel: pathwayRow.purpose_label,
    status: pathwayRow.status,
    steps,
    sources,
  };
}

export async function fetchSupportPathway(
  db: D1Database,
  params: { municipality: string; lifestage: Lifestage; purposeId: string },
): Promise<SupportPathwayData | null> {
  const municipalityCode = municipalityToCode(params.municipality) ?? "";
  const pathwayRow = await db
    .prepare(`SELECT ${SUPPORT_PATHWAY_ROW_COLUMNS} FROM support_pathways WHERE municipality_code = ? AND lifestage = ? AND purpose_id = ?`)
    .bind(municipalityCode, params.lifestage, params.purposeId)
    .first<SupportPathwayRow>();

  if (!pathwayRow) return null;

  const stepResult = await db
    .prepare("SELECT step_order, title, actor, contact, is_conditional, note FROM support_pathway_steps WHERE pathway_id = ? ORDER BY step_order")
    .bind(pathwayRow.id)
    .all<SupportPathwayStepRow>();

  return toSupportPathwayData(pathwayRow, stepResult.results ?? []);
}

/**
 * 想定ルートを id(support_pathways.id)から直接再取得する。
 * 掲載情報の訂正・更新報告(`/api/content-report`)がクライアント由来の値を信用せず、送信時点の
 * スナップショットをサーバー側で独立に組み立てるために使う(facility-report の
 * `fetchFacilityById` と同じ設計判断)。該当データが無い場合は `null` を返す。
 */
export async function fetchSupportPathwayById(db: D1Database, id: string): Promise<SupportPathwayData | null> {
  const pathwayRow = await db
    .prepare(`SELECT ${SUPPORT_PATHWAY_ROW_COLUMNS} FROM support_pathways WHERE id = ?`)
    .bind(id)
    .first<SupportPathwayRow>();

  if (!pathwayRow) return null;

  const stepResult = await db
    .prepare("SELECT step_order, title, actor, contact, is_conditional, note FROM support_pathway_steps WHERE pathway_id = ? ORDER BY step_order")
    .bind(pathwayRow.id)
    .all<SupportPathwayStepRow>();

  return toSupportPathwayData(pathwayRow, stepResult.results ?? []);
}
