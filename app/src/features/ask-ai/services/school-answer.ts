// 学校固有の定型質問への回答組み立て(掲載情報の訂正・更新報告の拡張と同時に追加)。
//
// `facility-answer.ts`(TICKET-0048 AC-3)と同じ設計判断: 「学校固有の質問は D1 の手動調査
// データのみから回答する」ことを最も厳密に満たすため、LLM を介さず決定的にテンプレートへ
// 値を埋め込む。学校情報(school-info.ts)は施設(facilities)と異なり risk_level/サマリーモード
// の概念を持たない(手動調査データは全件そのまま表示する設計、FR-027の出し分け対象外)ため、
// facility-answer.ts のようなリスク区分による出し分けは一切行わない。
//
// D1 アクセスを含まないため、ユニットテストで担保する(NFR-72)。

import { CONFIRMATION_STATUS_LABELS, DISABILITY_TYPE_LABELS } from "@/features/support/constants/school-labels";
import { dedupeSources } from "@/features/support/services/dedupe-sources";
import type { SchoolWithDetails } from "@/features/support/services/school-info";

import type { AskSource } from "@/features/ask-ai/schema/ask";

export interface SchoolAnswer {
  answer: string;
  sources: AskSource[];
}

/**
 * 学校自体のsourcesと各固定級のsourcesを結合・重複排除し、AskSource形式へ変換する。
 * `confirmedOn`のある出典のみを対象とするSourceRefはdedupeSourcesの`DedupableSource`
 * 構造的部分型を満たす。
 */
function toSources(school: SchoolWithDetails): AskSource[] {
  const merged = dedupeSources([
    ...(school.sources ?? []),
    ...school.fixedClasses.flatMap((fixedClass) => fixedClass.sources ?? []),
  ]);
  return merged.map((source) => ({
    credit: `出典: ${source.label}（確認日: ${source.confirmedOn}）`,
    sourceUrl: source.url ?? null,
  }));
}

/**
 * "school-fixed-class": 固定学級(特別支援学級)の情報のみから回答を組み立てる。
 * `status`が`unconfirmed`/`phone_required`の固定級は、確定した事実として断定せず
 * 「未確認」「要電話確認」と明示する(`SchoolCard.tsx`の`CONFIRMATION_STATUS_LABELS`と
 * 同じ語彙・同じ考え方)。
 */
function buildFixedClassAnswer(school: SchoolWithDetails): string {
  if (school.fixedClasses.length === 0) {
    return `${school.name}に固定学級(特別支援学級)があるという情報は現在確認できていません。詳しくは学校へ直接お問い合わせください。`;
  }
  const hasUnconfirmed = school.fixedClasses.some((fixedClass) => fixedClass.status !== "confirmed");
  const items = school.fixedClasses.map((fixedClass) => {
    const disabilityLabel = DISABILITY_TYPE_LABELS[fixedClass.disabilityType] ?? fixedClass.disabilityType;
    const classNamePart = fixedClass.className ? `・${fixedClass.className}` : "";
    const statusLabel = CONFIRMATION_STATUS_LABELS[fixedClass.status] ?? fixedClass.status;
    const statusPart = fixedClass.status === "confirmed" ? "" : `(${statusLabel})`;
    return `${disabilityLabel}${classNamePart}${statusPart}`;
  });
  const base = `${school.name}には、${items.join("、")}の固定学級(特別支援学級)があります。`;
  return hasUnconfirmed ? `${base}「未確認」「要電話確認」の情報は学校へ直接ご確認ください。` : base;
}

/**
 * "school-resource-room": 特別支援教室(通級)の情報のみから回答を組み立てる。
 * 拠点校方式(拠点校自身か、拠点校の教員が巡回する対象校か)を区別して案内する。
 */
function buildResourceRoomAnswer(school: SchoolWithDetails): string {
  const resourceRoom = school.resourceRoom;
  if (!resourceRoom || !resourceRoom.hasResourceRoom) {
    return `${school.name}で特別支援教室(通級)が利用できるという情報は現在確認できていません。詳しくは学校へ直接お問い合わせください。`;
  }
  if (resourceRoom.isHubSchool) {
    const groupPart = resourceRoom.groupName ? `(${resourceRoom.groupName})` : "";
    return `${school.name}は特別支援教室(通級)の拠点校です${groupPart}。`;
  }
  const hubPart = resourceRoom.hubSchoolName ? `拠点校(${resourceRoom.hubSchoolName})` : "拠点校";
  return `${school.name}では、${hubPart}の教員が巡回してくる形で特別支援教室(通級)を利用できます。`;
}

/** "school-contact": 電話番号・所在地(phone/address)のみから回答を組み立てる。 */
function buildContactAnswer(school: SchoolWithDetails): string {
  const parts: string[] = [];
  if (school.phone) parts.push(`お電話(${school.phone})`);
  if (school.address) parts.push(`所在地(${school.address})`);

  if (parts.length === 0) {
    return `${school.name}の連絡先情報は現在確認できません。学校の公式サイト等で最新情報をご確認ください。`;
  }
  return `${school.name}へは、${parts.join("・")}でご確認いただけます。`;
}

/**
 * "school-overview": 固定学級・特別支援教室の有無のみから概要を組み立てる
 * (個々の詳細情報はほかの定型質問に譲り、ここでは全体像のみを示す)。
 */
function buildOverviewAnswer(school: SchoolWithDetails): string {
  const supports: string[] = [];
  if (school.fixedClasses.length > 0) supports.push("固定学級(特別支援学級)");
  if (school.resourceRoom?.hasResourceRoom) supports.push("特別支援教室(通級)");

  if (supports.length === 0) {
    return `${school.name}の支援体制について確認できている情報は限られています。詳しくは学校へ直接お問い合わせください。`;
  }
  return `${school.name}では、${supports.join("・")}を利用できる場合があります。詳しい対象・条件は学校へ直接ご確認ください。`;
}

/**
 * 学校固有の定型質問への回答を D1 の手動調査データのみから組み立てる。
 * 未知の questionId は呼び出し前に zod(SCHOOL_QUESTION_IDS)で弾かれている前提のため、
 * ここでは対応表に無い id を渡された場合のみ例外を投げる(実装バグの早期検知、
 * facility-answer.ts の `buildFacilityAnswer` と同じ方針)。
 */
export function buildSchoolAnswer(questionId: string, school: SchoolWithDetails): SchoolAnswer {
  const sources = toSources(school);

  switch (questionId) {
    case "school-fixed-class":
      return { answer: buildFixedClassAnswer(school), sources };
    case "school-resource-room":
      return { answer: buildResourceRoomAnswer(school), sources };
    case "school-contact":
      return { answer: buildContactAnswer(school), sources };
    case "school-overview":
      return { answer: buildOverviewAnswer(school), sources };
    default:
      throw new Error(`buildSchoolAnswer: unknown questionId "${questionId}"`);
  }
}
