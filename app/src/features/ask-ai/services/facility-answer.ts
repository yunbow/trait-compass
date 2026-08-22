// 窓口固有の定型質問への回答組み立て(TICKET-0048 AC-3)。
//
// 「施設固有の質問は D1 由来の事実情報のみから回答する」という AC-3 の制約を最も厳密に
// 満たすため、LLM を介さず D1 の値から決定的に回答文を組み立てる(services/checklist.ts
// (TICKET-0046)と同じ設計判断: per-user creativity が不要な事実回答は決定的テンプレートで
// 組み立てることで、捏造ガード・出力ガードが不要になり安全性の検証面積を最小化できる)。
//
// D1 アクセスを含まないため、ユニットテストで担保する(NFR-72)。
//
// **リスク区分別の表示出し分け(FR-027)との整合**: `FacilityCard` は riskLevel が medium/high の
// 施設について住所・電話番号を非表示にする(`riskLevelToDisplayMode` が "summary" を返す場合)。
// `AskAiPanel` はカードの mode によらず常に表示されるため、"facility-contact" の回答が
// この非表示原則を迂回して電話番号を漏らさないよう、riskLevel が "low"(mode="full")の場合のみ
// 電話番号を回答に含める。URL は mode によらずカード上に常に表示されるため常に含めてよい。

import { formatSourceCredit, riskLevelToDisplayMode, truncateForSummary } from "@/features/support/services/facility-display";
import type { FacilityRow } from "@/features/support/services/facility-search";

import type { AskSource } from "@/features/ask-ai/schema/ask";

const AGE_RANGE_LABELS: Record<FacilityRow["ageRange"], string> = {
  child: "18歳未満の方が対象です。",
  adult: "18歳以上の方が対象です。",
  both: "18歳未満・18歳以上のどちらの方も対象です。",
};

export interface FacilityAnswer {
  answer: string;
  sources: AskSource[];
}

function toSource(facility: FacilityRow): AskSource {
  return { credit: formatSourceCredit(facility), sourceUrl: facility.sourceUrl };
}

/** "facility-age-range": 対象年齢(age_range)のみから回答を組み立てる。 */
function buildAgeRangeAnswer(facility: FacilityRow): string {
  return `${facility.name}は、${AGE_RANGE_LABELS[facility.ageRange]}`;
}

/**
 * "facility-contact": 電話番号・URL(phone/url)のみから回答を組み立てる。
 * riskLevel が medium/high(mode="summary")の施設は、カード本体と同じく電話番号を含めない
 * (FR-027 の住所・電話非表示原則との整合)。
 */
function buildContactAnswer(facility: FacilityRow): string {
  const showPhone = riskLevelToDisplayMode(facility.riskLevel) === "full";
  const parts: string[] = [];
  if (showPhone && facility.phone) parts.push(`お電話(${facility.phone})`);
  if (facility.url) parts.push(`公式サイト(${facility.url})`);

  if (parts.length === 0) {
    return `${facility.name}の連絡先情報は現在確認できません。出典元のデータセットで最新情報をご確認ください。`;
  }
  return `${facility.name}へは、${parts.join("または")}からご連絡・お申し込みください。`;
}

/**
 * "facility-overview": 説明文(description)のみから回答を組み立てる。
 * riskLevel が medium/high(mode="summary")の施設は、カード本体と同じく `truncateForSummary`
 * で切り詰めた説明文を使う(FR-027 との整合。description 自体は非表示にしない)。
 */
function buildOverviewAnswer(facility: FacilityRow): string {
  if (!facility.description) {
    return `${facility.name}の詳しい概要は現在確認できません。出典元のデータセットで最新情報をご確認ください。`;
  }
  const mode = riskLevelToDisplayMode(facility.riskLevel);
  const description = mode === "full" ? facility.description : truncateForSummary(facility.description);
  return `${facility.name}(${facility.municipality})は、${description}`;
}

/**
 * 施設固有の定型質問への回答を D1 の事実情報のみから組み立てる(AC-3)。
 * 未知の questionId は呼び出し前に zod(FACILITY_QUESTION_IDS)で弾かれている前提のため、
 * ここでは対応表に無い id を渡された場合のみ例外を投げる(実装バグの早期検知)。
 */
export function buildFacilityAnswer(questionId: string, facility: FacilityRow): FacilityAnswer {
  const sources = [toSource(facility)];

  switch (questionId) {
    case "facility-age-range":
      return { answer: buildAgeRangeAnswer(facility), sources };
    case "facility-contact":
      return { answer: buildContactAnswer(facility), sources };
    case "facility-overview":
      return { answer: buildOverviewAnswer(facility), sources };
    default:
      throw new Error(`buildFacilityAnswer: unknown questionId "${questionId}"`);
  }
}
