import { NextResponse, type NextRequest } from "next/server";

import { getDbOrErrorResponse, parseJsonRequest, validatedJsonResponse } from "@/lib/api/route-helpers";

import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { searchFacilities } from "@/features/support/services/facility-search";

import {
  PREPARE_CONSULT_PURPOSE_OPTIONS,
  PREPARE_CONTACT_METHOD_OPTIONS,
} from "@/features/prepare/constants/prepare-options";
import { buildPrepareChecklist, buildPrepareFlow, buildPrepareQuestions } from "@/features/prepare/services/checklist";
import { selectPrepareFacilityRows, toPrepareFacility } from "@/features/prepare/services/facilities";
import { buildPrepareSummaryText } from "@/features/prepare/services/summary-template";
import { PREPARE_FACILITY_LIMIT, PrepareRequestSchema, PrepareResponseSchema } from "@/features/prepare/schema/prepare";
import type { PrepareResponse } from "@/features/prepare/schema/prepare";
import { LIFESTAGE_OPTIONS } from "@/features/support/services/lifestage-mapping";

// `/api/prepare`(TICKET-0046)。結果画面の「相談の準備をする」導線から、明示同意・送信内容
// プレビューを経たあとにのみ呼び出される想定(FR-041、summarize/recommend route と同じ方針)。
// POST のみを受け付ける(状態変更 API は POST/PUT/DELETE のみ許可、という方針による)。
//
// **入力は選択式のみ(AC-2、危機介入回避構造の維持)**: このルートには自由記述フィールドが
// 一切存在しない(PrepareRequestSchema 参照)。
//
// **設計判断(P0対応、作業ログにも記載)**: 「困りごとの要約」を含め、このルートが返す
// summary/checklist/flow/questions はすべて外部の生成AIを介さず、決定的テンプレート
// (services/summary-template.ts・services/checklist.ts)で組み立てる。以前は summary のみ
// LLM(Vertex AI Gemini)で生成していたが、選択式の入力(構造化された相談メモ7項目+上位
// カテゴリ+困りごとタグ)はテンプレートで十分に自然な要約文を組み立てられるため、外部の
// 生成AIへの送信自体を撤廃した(利用者が個人情報送信リスクを避けつつメモを作れるように
// するため)。自由記述を使ってAIに整理してほしい場合は、別モード(AiSummarySection、
// `/api/summarize`)を選べる。
//
// **事実情報の捏造防止(fact-guard 方針)**: 窓口候補の name/municipality/address/phone/url/
// sourceCredit/sourceUrl はすべて D1(searchFacilities)由来の値を services/facilities.ts の
// `toPrepareFacility` でそのまま詰めるのみで、外部の入力から抽出・上書きする処理は一切行わない。
//
// NFR-36(ログ非保存)に関する注意: このファイル全体で選択タグ・上位カテゴリ・relationship・
// lifestage(元の年齢選択、5区分ライフステージ)・相談メモ追加項目(situations/duration/
// lifeStatus/consultPurpose/contactMethod/accommodations/priorSupport)を console.log 等に
// 一切出力しない。zod 検証エラー時のエラーハンドリングも同様に、汎用メッセージのみを返す。

function buildValidatedJsonResponse(body: PrepareResponse): NextResponse {
  return validatedJsonResponse(body, PrepareResponseSchema);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseJsonRequest(request, PrepareRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const {
    topCategories,
    tags,
    age,
    lifestage,
    municipality: municipalityEntry,
    relationship,
    situations,
    consultPurpose,
    contactMethod,
    accommodations,
  } = parsed.data;
  const municipality = municipalityEntry.name;

  const dbResult = getDbOrErrorResponse("窓口情報の取得に失敗しました。しばらくしてから再度お試しください。");
  if (!dbResult.ok) return dbResult.response;
  const { db } = dbResult;

  const searchResult = await searchFacilities(db, { ageGroup: age, municipality, tags, lifestage });
  const facilities = selectPrepareFacilityRows(searchResult, PREPARE_FACILITY_LIMIT).map(toPrepareFacility);

  const topCategoryLabels = topCategories.map((key) => CATEGORY_LABELS[key]);
  const lifestageLabel = lifestage ? LIFESTAGE_OPTIONS.find((o) => o.value === lifestage)?.label : undefined;
  const summary = buildPrepareSummaryText(topCategoryLabels, tags, relationship, {
    lifestageLabel,
    situationLabels: situations.length > 0 ? situations : undefined,
    consultPurpose,
    consultPurposeLabel: consultPurpose ? PREPARE_CONSULT_PURPOSE_OPTIONS.find((o) => o.value === consultPurpose)?.label : undefined,
    contactMethod,
    contactMethodLabel: contactMethod ? PREPARE_CONTACT_METHOD_OPTIONS.find((o) => o.value === contactMethod)?.label : undefined,
    accommodationLabels: accommodations.length > 0 ? accommodations : undefined,
  });

  return buildValidatedJsonResponse({
    summary,
    checklist: buildPrepareChecklist(tags),
    flow: buildPrepareFlow(),
    questions: buildPrepareQuestions(tags),
    facilities,
    isFallback: searchResult.isFallback,
    fallbackMessage: searchResult.fallbackMessage,
  });
}
