// 目的ピックアップ(目的選択画面「それ以外」の自由記述からの目的ID推定)のプロンプト構築。
//
// 非診断ガード(FR-044, NFR-51)は src/features/ai-summary/services/prompt.ts・
// src/features/recommend/services/prompt.ts と同じ方針(「診断」「判定」「あなたは○○です」等の
// 断定表現の禁止)に加え、本機能固有の制約として「与えられた選択肢リストの id、または `none` の
// 1行以外は一切出力しない」ことを明示する。出力を id のみに限定するのは、選択肢に無い文字列や
// 挨拶・説明文が紛れ込むと `parsePurposePickupOutput` 側の実在チェックで弾かれ機能しないため、
// および LLM の応答をそのまま利用者に見せる設計ではない(id は route.ts 側で選択肢ラベルへの
// 変換にのみ使う)ことをモデルにも明確化するため。
//
// 出力側の最終防波堤は src/features/ai-summary/services/output-guard.ts(禁止語チェック)と、
// 本ファイルの `parsePurposePickupOutput`(選択肢リストに実在する id かどうかの厳密一致)の
// 2段構え。`parsePurposePickupOutput` が id の実在チェックを行うため、万一プロンプト指示に
// 反した id や無関係な文字列が返っても、選択肢外の値がそのまま `matchedPurposeId` に
// 採用されることはない(あいまい一致はしない=誤マッチ防止)。
//
// ルール1の文言は src/lib/ai/non-diagnostic-policy.ts を単一情報源とする(語彙統一の
// ルール2は本ファイルでは不使用。出力を選択肢の id のみに絞る設計のため)。
// 注入対策ルールと入力デリミタは `src/lib/ai/prompt-injection-policy.ts` を単一情報源とする(FR-046)。

import { NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS } from "@/lib/ai/non-diagnostic-policy";
import { PROMPT_INJECTION_GUARD_RULE_BODY, wrapUserInput } from "@/lib/ai/prompt-injection-policy";

export const PURPOSE_PICKUP_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION = `あなたは、発達特性の日常の困りごとチェックの支援情報ナビゲーション用アシスタントです。次のルールを厳守してください。

${NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS}
2. 与えられた「目的の選択肢」リストの中から、利用者の自由記述に最も近いものを1つだけ選び、
   その id のみを1行で返す。当てはまるものが無い場合・判断できない場合は "none" とだけ返す。
3. 選択肢リストに無い id・説明文・挨拶・前置き・理由の説明など、id(または "none")以外の
   文字列は一切出力しない。
4. 入力に自傷・希死念慮など危機介入を要する内容が含まれると判断した場合も、選択は行わず
   "none" とだけ返す。
5. ${PROMPT_INJECTION_GUARD_RULE_BODY}`;

export interface PurposeOptionForPrompt {
  id: string;
  label: string;
}

/**
 * 自由記述 + 目的の選択肢リストから、目的ピックアップ用プロンプトを組み立てる
 * (recommend の `buildFacilityNotePrompt` と同じ構造)。
 */
export function buildPurposePickupPrompt(freeText: string, options: readonly PurposeOptionForPrompt[]): string {
  const optionLines = options.map((option) => `${option.id}: ${option.label}`).join("\n");
  return `以下は、支援情報を探している利用者の自由記述と、選べる「目的」の選択肢リストです。
非診断ガードの指示に従い、利用者の自由記述に最も近い目的の id を1つだけ選び、その id のみを
1行で返してください。当てはまるものが無い場合は "none" とだけ返してください。

【利用者の自由記述】
${wrapUserInput(freeText)}

【目的の選択肢】
${optionLines}
none: 当てはまるものが無い`;
}

/**
 * LLM の応答テキストから、選択肢リストに実在する id、または null(none・不一致・空文字)を
 * 判定する純関数。空白のみ・前後の空白程度は trim() で吸収するが、それ以上の曖昧一致
 * (大文字小文字の揺れ・部分一致等)はしない(誤マッチ防止)。
 */
export function parsePurposePickupOutput(rawText: string, options: readonly PurposeOptionForPrompt[]): string | null {
  const trimmed = rawText.trim();
  if (trimmed === "none" || trimmed.length === 0) return null;
  return options.some((option) => option.id === trimmed) ? trimmed : null;
}
