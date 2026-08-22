// AI 困りごと要約(TICKET-0022)のプロンプト構築。
//
// 非診断ガード(FR-044, NFR-51): 医師法17条・薬機法(SaMD)・医療広告ガイドラインへの
// 抵触を避けるため、system 相当の指示(`NON_DIAGNOSTIC_SYSTEM_INSTRUCTION`)で
// 「診断・病名・断定をしない」「傾向と対処のヒントのみ」を明記し、危機的内容を検知した
// 場合の振る舞いも重ねて指示する(実際の危機介入判定・分岐は呼び出し側の
// `services/crisis-detection.ts` が LLM 呼び出し自体をスキップする形で行うため、
// このプロンプトの指示は防御の多層化目的)。
//
// 出力側の最終防波堤は `services/output-guard.ts`(禁止語を含む応答のサーバー側リジェクト)
// であり、本ファイルはあくまで「望ましい出力を引き出すための指示」を担う。
//
// ルール1・ルール2の文言は src/lib/ai/non-diagnostic-policy.ts を単一情報源とする
// (他機能の prompt.ts と共通のため)。ルール3以降・危機介入時の指示は本ファイル固有。
// 注入対策ルールと入力デリミタは `src/lib/ai/prompt-injection-policy.ts` を単一情報源とする(FR-046)。

import {
  NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS,
  NON_DIAGNOSTIC_RULE_VOCABULARY,
} from "@/lib/ai/non-diagnostic-policy";
import { PROMPT_INJECTION_GUARD_RULE_BODY, wrapUserInput } from "@/lib/ai/prompt-injection-policy";

/**
 * 危機介入時に返す定型文(FR-044 AC-4)。要約は行わず、この文言のみを返す。
 * 一般相談窓口(お住まいの自治体の相談窓口・よりそいホットライン)を案内する。
 */
export const CRISIS_GUIDANCE_TEXT =
  "つらいお気持ちを抱えていらっしゃるようですね。ここでは内容の要約は行いません。" +
  "緊急の場合は110番/119番へ連絡してください。それ以外の場合も、お一人で抱え込まず、" +
  "お住まいの自治体の相談窓口や、よりそいホットライン等の一般相談窓口に相談してください。";

/**
 * 注入検知時に返す定型文(FR-046)。要約は行わず、この文言のみを返す。
 * 誤検知(通常の困りごとを注入と誤判定)があり得るため、断定を避けた文面にしている。
 */
export const INJECTION_GUARD_FALLBACK_TEXT =
  "ご入力の内容に、AIへの指示や設定の変更を求める文章が含まれている可能性があるため、AIによる要約は行いませんでした。" +
  "日常の困りごとについての自由記述に書き直して、もう一度お試しください。";

export const NON_DIAGNOSTIC_SYSTEM_INSTRUCTION = `あなたは、発達特性の日常の困りごとチェックのAI困りごと要約アシスタントです。次のルールを厳守してください。

${NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS}
${NON_DIAGNOSTIC_RULE_VOCABULARY}
3. 入力された自由記述を要約し、日常での対処のヒントを一般的な範囲で添える。それ以上のことは書かない(治療方針・服薬・専門的な処置の提案はしない)。
4. 入力に自傷・希死念慮など危機介入を要する内容が含まれると判断した場合、要約は行わず「お住まいの自治体の相談窓口や、よりそいホットライン等の一般相談窓口に相談してください」という趣旨の案内のみを返す。
5. 出力は日本語で、3〜5文程度の簡潔な文章とする。
6. ${PROMPT_INJECTION_GUARD_RULE_BODY}`;

/**
 * ユーザーへ提示する要約生成プロンプトを組み立てる。
 * 送信される情報は「自由記述全文」と「上位カテゴリ名」のみ(AiSummarySection のプレビューと
 * 一致させる)。回答の生データ・地域・年齢は一切含めない。
 */
export function buildSummarizePrompt(freeText: string, topCategoryLabels: string[]): string {
  const categoriesLine =
    topCategoryLabels.length > 0 ? topCategoryLabels.join("、") : "(上位カテゴリなし)";

  return `以下は、発達特性の日常の困りごとチェックの結果画面で利用者が任意で入力した困りごとの自由記述と、
日常の困りごとチェックの上位カテゴリ(参考情報)です。非診断ガードの指示に従い、要約と一般的な対処のヒントを
返してください。

【上位カテゴリ】${categoriesLine}

【困りごとの自由記述】
${wrapUserInput(freeText)}`;
}
