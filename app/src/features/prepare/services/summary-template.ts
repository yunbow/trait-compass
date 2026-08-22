// 相談メモ「困りごとの要約」の決定的テンプレート生成(P0対応)。
//
// 「選んだ項目からメモを作る」モードでは、外部の生成AIを一切使わず、選択内容(上位カテゴリ・
// 困りごとタグ・相談する立場・困っている場面・相談したい内容・希望する連絡方法・配慮事項、
// いずれもホワイトリスト由来の選択式情報のみ)から機械的に短い要約文を組み立てる。
// checklist.ts と同じ方針で、推測・創作は行わず、選択されたラベルをそのまま文へ当てはめるのみ。
// 文言自体が禁止語(src/lib/copy/banned-words.ts)を含まないことは、copy-lint と
// 本ファイルのユニットテストの双方で担保する。

import type { PrepareRelationship } from "@/features/prepare/schema/prepare";
import type { PrepareConsultPurpose, PrepareContactMethod } from "@/features/prepare/constants/prepare-options";

export interface PrepareSummaryTemplateExtra {
  /** 元の年齢選択(5区分ライフステージ)のラベル。未指定時は年齢を文中に含めない。 */
  lifestageLabel?: string;
  /** 「困っている場面」の選択ラベル(空なら未選択)。 */
  situationLabels?: string[];
  consultPurpose?: PrepareConsultPurpose;
  consultPurposeLabel?: string;
  contactMethod?: PrepareContactMethod;
  contactMethodLabel?: string;
  /** 「配慮事項」の選択ラベル(空なら未選択)。 */
  accommodationLabels?: string[];
}

/**
 * 選択式の情報から「困りごとの要約」を機械的に組み立てる(外部の生成AIを使わない)。
 * 「相談したい内容」が「その他」の場合、「希望する連絡方法」が「特に希望なし」の場合は、
 * 具体的な内容が無いため該当行を省略する(存在しない情報を捏造しない)。
 */
export function buildPrepareSummaryText(
  topCategoryLabels: string[],
  tagLabels: string[],
  relationship: PrepareRelationship = "self",
  extra: PrepareSummaryTemplateExtra = {},
): string {
  const lines: string[] = [];

  const agePrefix = extra.lifestageLabel ? `${extra.lifestageLabel}の` : "";
  lines.push(relationship === "guardian" ? `${agePrefix}子どもについて相談したいです。` : `${agePrefix}本人として相談したいです。`);

  const issues = tagLabels.length > 0 ? tagLabels : topCategoryLabels;
  if (issues.length > 0) {
    // PREPARE_SITUATION_TAGS の各ラベルは「家庭で」「人と話すとき」のように、
    // すでに完成した副詞句(場面の説明)として定義されている(prepare-options.ts 参照)。
    // 「で」で終わらない場合もあるため、末尾に助詞を付け足さず読点で繋ぐ。
    const scenePrefix = extra.situationLabels && extra.situationLabels.length > 0 ? `${extra.situationLabels.join("、")}、` : "";
    lines.push(`${scenePrefix}「${issues.join("」「")}」に関する困りごとがあります。`);
  }

  if (extra.consultPurpose && extra.consultPurpose !== "other" && extra.consultPurposeLabel) {
    lines.push(`${extra.consultPurposeLabel}です。`);
  }

  if (extra.contactMethod && extra.contactMethod !== "no-preference" && extra.contactMethodLabel) {
    lines.push(`可能であれば${extra.contactMethodLabel}で相談を希望します。`);
  }

  if (extra.accommodationLabels && extra.accommodationLabels.length > 0) {
    lines.push(`また、${extra.accommodationLabels.join("・")}について配慮をお願いしたいです。`);
  }

  return lines.join("\n");
}
