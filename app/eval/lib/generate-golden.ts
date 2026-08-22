// ゴールデンデータ生成スクリプト(RAG 定量評価パイプライン拡張)。
//
// `eval/fixtures/retrieval-golden.json`(手書き12件、初期シードデータ前提)は、本番の実データ
// (D1 4,808件・23自治体分の施設)の分布を反映していない。「ある区市町村で意味的検索が構造的に
// 取りこぼす」という問題(2026-08-20 発覚: 千代田区クエリで千代田区の施設が0件)を検出するには、
// 全区市町村を横断的に網羅したゴールデンデータが必要。本スクリプトは D1 に対して SQL 由来の
// データを取得し、正解集合を**機械的に**(LLM を使わず)導出して
// `eval/fixtures/retrieval-golden.generated.json` に書き出す。
//
// **都度自動生成ではなくスナップショット方式**: 本スクリプトの出力はコミットして使う。
// D1 のデータが変わったら(自治体データの追加・入れ替え等)再実行して再生成する運用とする
// (`npm run eval` の実行のたびに毎回 D1 へアクセスして再生成すると、評価の再現性が損なわれる
// ため)。
//
// **自由文クエリは機械生成できない**: 自由文クエリとその意味的な正解対応は SQL からは決定
// できないため、`eval/fixtures/query-templates.json`(手書き、6 タグ × 8 service_category に
// それぞれ1〜2パターン)をレビュー可能な fixture として用意し、本スクリプトはそこから
// 層化抽出(タグ・service_category を一巡させ偏りなく割り当てる決定的ロジック)で
// 区市町村 × 年齢区分の組へ割り当てる。
//
// **正解集合は2層**(Fable5 設計方針、企画・実装で採用済みの「広域窓口は常に検索対象に含まれる」
// という設計を踏襲):
//   - requiredFacilityIds: 対象区市町村内の該当施設(Recall の分母)。
//   - acceptableFacilityIds: 広域窓口(municipality_code = BROAD_AREA_MUNICIPALITY_CODE)の
//     該当施設。Precision では正解扱いするが Recall の分母には数えない。
//
// **パフォーマンス上の設計判断**: `eval/lib/d1.ts` の `queryD1()` は `wrangler d1 execute` を
// 子プロセスとして起動するため、1呼び出しあたりのオーバーヘッドが大きい(数百ms〜)。
// 46(区市町村×年齢)× 各3テンプレート × 2層(required/acceptable)を素朴に SQL 発行すると
// 数百回の子プロセス起動が必要になり非常に遅くなる。そこで facilities/facility_tags を
// それぞれ1回の SQL で全件取得し、正解集合の判定(区市町村一致・年齢一致・
// タグ一致 OR service_category 一致)は取得済みデータに対する決定的な JS フィルタとして
// 行う。判定条件自体は `searchFacilities`(facility-search.ts)の WHERE 句と同じ論理を
// そのまま踏襲しており、SQL 発行を1回にまとめただけで「SQL 由来のデータからの機械的導出」
// という性質は変わらない。

import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { AgeGroup } from "@/features/support/schema/age-group";
import { AGE_GROUP_VALUES } from "@/features/support/schema/age-group";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import { BROAD_AREA_MUNICIPALITY_CODE } from "@/features/support/constants/municipality-codes";
import { getMunicipalityByCode } from "@/features/support/constants/municipality-registry";

import { queryD1, isD1Available } from "./d1";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const TEMPLATES_PATH = path.join(HERE, "..", "fixtures", "query-templates.json");
const OUTPUT_PATH = path.join(HERE, "..", "fixtures", "retrieval-golden.generated.json");

/** ケース総数の狙い値(spec: 「合計100〜150ケース程度になるよう調整する」の中央値)。 */
const TARGET_TOTAL_CASES = 125;
/** 1区市町村×年齢区分あたりに割り当てるテンプレート件数の範囲(spec: 2〜4件)。 */
const MIN_TEMPLATES_PER_COMBO = 1;
const MAX_TEMPLATES_PER_COMBO = 4;

/**
 * 実際の組み合わせ数(区市町村数 × 年齢区分数)から、1組み合わせあたりのテンプレート割当数を
 * 決定的に導出する。spec は「23自治体×2年齢区分=46組み合わせ、2〜4件/組み合わせ、
 * 合計100〜150ケース程度」を想定しているが、D1 の実データ(取込状況)によって実際の
 * 区市町村数は変わりうる(このリポジトリのローカル D1 は本番より広い区市町村を含む場合がある)。
 * 本関数は組み合わせ数に応じて `round(TARGET_TOTAL_CASES / comboCount)` を
 * `[MIN_TEMPLATES_PER_COMBO, MAX_TEMPLATES_PER_COMBO]` にクランプすることで、
 * どの区市町村数でも「全組み合わせを最低1件は網羅しつつ、合計件数を目標値に近づける」
 * 動作にする(区市町村数を46と仮定できる場合は自然に3件/組み合わせになり、spec の想定と一致する)。
 */
function resolveTemplatesPerCombo(comboCount: number): number {
  if (comboCount <= 0) return MIN_TEMPLATES_PER_COMBO;
  const ideal = Math.round(TARGET_TOTAL_CASES / comboCount);
  return Math.max(MIN_TEMPLATES_PER_COMBO, Math.min(MAX_TEMPLATES_PER_COMBO, ideal));
}

/**
 * db/schema.sql `facilities.service_category` CHECK 制約と同じ8値(唯一の正)。
 * カテゴリタグ(SUPPORT_TAGS)とは独立した国制度上のサービス分類。
 */
type ServiceCategory =
  | "児童発達支援"
  | "放課後等デイサービス"
  | "保育所等訪問支援"
  | "居宅訪問型児童発達支援"
  | "障害児相談支援"
  | "自立訓練"
  | "就労移行支援"
  | "就労定着支援";

interface QueryTemplate {
  id: string;
  kind: "tag" | "service_category";
  tags: SupportTag[];
  serviceCategory: ServiceCategory | null;
  query: string;
}

/** `eval/lib/generate-golden.ts` の出力1件分(2層の正解集合を持つ、既存 GoldenCase とは別スキーマ)。 */
export interface GeneratedGoldenCase {
  id: string;
  description: string;
  query: string;
  tags: SupportTag[];
  ageGroup: AgeGroup;
  municipality: string;
  requiredFacilityIds: string[];
  acceptableFacilityIds: string[];
}

interface FacilityFact {
  id: string;
  municipality_code: string;
  age_range: "child" | "adult" | "both";
  service_category: ServiceCategory | null;
  is_medical: 0 | 1;
  is_out_of_scope: 0 | 1;
}

interface MunicipalityFact {
  municipality_code: string;
}

interface FacilityTagFact {
  facility_id: string;
  tag: string;
}

function loadTemplates(): QueryTemplate[] {
  return JSON.parse(readFileSync(TEMPLATES_PATH, "utf8")) as QueryTemplate[];
}

/**
 * 実際に facilities データが存在する区市町村コード一覧(広域窓口・空文字は除く)を
 * municipality_code の昇順で返す。62区市町村のうち何自治体分のデータが入っているかは
 * データ取込状況に依存するため、レジストリの固定値ではなく D1 の実データから機械的に導出する。
 */
function fetchMunicipalityCodesWithData(): string[] {
  const rows = queryD1<MunicipalityFact>(
    `SELECT DISTINCT municipality_code FROM facilities
     WHERE municipality_code != '' AND municipality_code != '${BROAD_AREA_MUNICIPALITY_CODE}'
     ORDER BY municipality_code`,
  );
  return rows.map((r) => r.municipality_code);
}

function fetchAllFacilityFacts(): FacilityFact[] {
  return queryD1<FacilityFact>(
    `SELECT id, municipality_code, age_range, service_category, is_medical, is_out_of_scope FROM facilities`,
  );
}

function fetchAllFacilityTags(): Map<string, Set<string>> {
  const rows = queryD1<FacilityTagFact>(`SELECT facility_id, tag FROM facility_tags`);
  const tagsByFacilityId = new Map<string, Set<string>>();
  for (const row of rows) {
    const existing = tagsByFacilityId.get(row.facility_id);
    if (existing) {
      existing.add(row.tag);
    } else {
      tagsByFacilityId.set(row.facility_id, new Set([row.tag]));
    }
  }
  return tagsByFacilityId;
}

/**
 * `searchFacilities`(facility-search.ts)の WHERE 句と同じ論理(医療機関除外・対象外除外・
 * 年齢一致・区市町村一致)に、タグ一致 OR service_category 一致を組み合わせた正解判定(純関数)。
 */
function matchesGoldenCondition(
  facility: FacilityFact,
  targetMunicipalityCode: string,
  ageGroup: AgeGroup,
  template: QueryTemplate,
  tagsByFacilityId: ReadonlyMap<string, Set<string>>,
): boolean {
  if (facility.municipality_code !== targetMunicipalityCode) return false;
  if (facility.is_medical === 1) return false;
  if (facility.is_out_of_scope === 1) return false;
  if (facility.age_range !== "both" && facility.age_range !== ageGroup) return false;

  const facilityTags = tagsByFacilityId.get(facility.id);
  const matchesTag = template.tags.length > 0 && facilityTags != null && template.tags.some((t) => facilityTags.has(t));
  const matchesServiceCategory =
    template.serviceCategory != null && facility.service_category === template.serviceCategory;

  return matchesTag || matchesServiceCategory;
}

function selectRequiredAndAcceptable(
  facilities: readonly FacilityFact[],
  tagsByFacilityId: ReadonlyMap<string, Set<string>>,
  municipalityCode: string,
  ageGroup: AgeGroup,
  template: QueryTemplate,
): { requiredFacilityIds: string[]; acceptableFacilityIds: string[] } {
  const requiredFacilityIds: string[] = [];
  const acceptableFacilityIds: string[] = [];

  for (const facility of facilities) {
    if (matchesGoldenCondition(facility, municipalityCode, ageGroup, template, tagsByFacilityId)) {
      requiredFacilityIds.push(facility.id);
    }
    if (matchesGoldenCondition(facility, BROAD_AREA_MUNICIPALITY_CODE, ageGroup, template, tagsByFacilityId)) {
      acceptableFacilityIds.push(facility.id);
    }
  }

  return { requiredFacilityIds, acceptableFacilityIds };
}

/**
 * `templates` から `comboIndex` に応じて `templatesPerCombo` 件を決定的に選ぶ
 * (層化抽出: comboIndex が進むごとにテンプレート配列を巡回するため、タグ・service_category
 * を偏りなく一巡する。`Math.random()` は使わない)。
 */
function pickTemplatesForCombo(
  templates: readonly QueryTemplate[],
  comboIndex: number,
  templatesPerCombo: number,
): QueryTemplate[] {
  const picked: QueryTemplate[] = [];
  for (let offset = 0; offset < templatesPerCombo; offset++) {
    const index = (comboIndex * templatesPerCombo + offset) % templates.length;
    picked.push(templates[index]);
  }
  return picked;
}

function resolveMunicipalityDisplayName(code: string): string {
  return getMunicipalityByCode(code)?.name ?? code;
}

export interface GenerateGoldenSummary {
  caseCount: number;
  municipalityCount: number;
  outputPath: string;
}

export function generateGoldenCases(): { cases: GeneratedGoldenCase[]; summary: GenerateGoldenSummary } {
  const templates = loadTemplates();
  const municipalityCodes = fetchMunicipalityCodesWithData();
  const facilities = fetchAllFacilityFacts();
  const tagsByFacilityId = fetchAllFacilityTags();

  const comboCount = municipalityCodes.length * AGE_GROUP_VALUES.length;
  const templatesPerCombo = resolveTemplatesPerCombo(comboCount);

  const cases: GeneratedGoldenCase[] = [];
  let comboIndex = 0;
  let seq = 1;

  for (const municipalityCode of municipalityCodes) {
    const municipalityName = resolveMunicipalityDisplayName(municipalityCode);
    for (const ageGroup of AGE_GROUP_VALUES) {
      const templatesForCombo = pickTemplatesForCombo(templates, comboIndex, templatesPerCombo);
      for (const template of templatesForCombo) {
        const { requiredFacilityIds, acceptableFacilityIds } = selectRequiredAndAcceptable(
          facilities,
          tagsByFacilityId,
          municipalityCode,
          ageGroup,
          template,
        );

        cases.push({
          id: `G-${String(seq).padStart(3, "0")}`,
          description:
            `自動生成(eval/lib/generate-golden.ts、テンプレート: ${template.id})。` +
            `${municipalityName}(${municipalityCode})・${ageGroup === "child" ? "18歳未満" : "18歳以上"}向け。` +
            `requiredFacilityIds ${requiredFacilityIds.length}件, acceptableFacilityIds ${acceptableFacilityIds.length}件。`,
          query: template.query,
          tags: template.tags,
          ageGroup,
          municipality: municipalityName,
          requiredFacilityIds,
          acceptableFacilityIds,
        });
        seq++;
      }
      comboIndex++;
    }
  }

  return {
    cases,
    summary: { caseCount: cases.length, municipalityCount: municipalityCodes.length, outputPath: OUTPUT_PATH },
  };
}

function main(): void {
  if (!isD1Available()) {
    console.error(
      "[generate-golden] D1 に接続できませんでした。`npm run db:migrate:local && npm run db:seed:local:manual` " +
        "を実行してから再度お試しください(`EVAL_D1_REMOTE=1` で本番 D1 を対象にする場合は wrangler のリモート認証を確認してください)。",
    );
    process.exitCode = 1;
    return;
  }

  const { cases, summary } = generateGoldenCases();
  writeFileSync(OUTPUT_PATH, `${JSON.stringify(cases, null, 2)}\n`, "utf8");

  console.log(
    `[generate-golden] ${summary.caseCount}件のゴールデンケースを${summary.municipalityCount}自治体分から生成し、` +
      `${OUTPUT_PATH} に書き出しました。`,
  );
}

const isMainModule = process.argv[1] === fileURLToPath(import.meta.url);
if (isMainModule) {
  main();
}
