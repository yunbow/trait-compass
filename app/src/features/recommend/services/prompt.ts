// RAG 施設レコメンド(TICKET-0023, FR-042)のプロンプト構築。
//
// 非診断ガード(FR-044, NFR-51)は src/features/ai-summary/services/prompt.ts と同じ方針
// (「診断」「判定」「あなたは○○です」等の断定表現の禁止)に加え、本チケット固有の制約として
// 「施設名・電話番号・住所・URL 等の事実情報を新たに生成・繰り返さない」ことを明示する。
// これは事実情報を D1 の値でそのまま上書き表示する実装(app/api/recommend/route.ts)の
// 多層防御(defense-in-depth)であり、実際の事実情報の表示は本プロンプトの遵守に依存しない
// (route.ts は常に D1 の値のみを事実フィールドとして返し、LLM 応答からは理由文のみを採る)。
//
// 出力側の最終防波堤は services/fact-guard.ts(捏造された電話番号らしき文字列の検出)と
// src/features/ai-summary/services/output-guard.ts(禁止語チェック)の2段構え。
//
// ルール1の文言は src/lib/ai/non-diagnostic-policy.ts を単一情報源とする(語彙統一の
// ルール2は本ファイルでは不使用。出力を「理由文」のみに絞る設計のため)。
// 注入対策ルールと入力デリミタは `src/lib/ai/prompt-injection-policy.ts` を単一情報源とする(FR-046)。
// ※施設説明文経由の間接インジェクションは FR-046 のスコープ外。データ投入側のレビューで担保する

import { NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS } from "@/lib/ai/non-diagnostic-policy";
import { PROMPT_INJECTION_GUARD_RULE_BODY, wrapUserInput } from "@/lib/ai/prompt-injection-policy";

export const RECOMMEND_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION = `あなたは、発達特性の日常の困りごとチェックの支援情報レコメンド用アシスタントです。次のルールを厳守してください。

${NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS}
2. 出力は「この施設が相談内容に合いそうな理由」の説明文のみとする。施設名・電話番号・住所・URL 等の
   事実情報を新たに作り出したり、繰り返し記載したりしない(事実情報は別途システム側が正確な情報を表示する)。
3. 出力は日本語で1〜2文程度の簡潔な文章とする。
4. 入力に自傷・希死念慮など危機介入を要する内容が含まれると判断した場合、理由の生成は行わず
   「一般相談窓口へのご案内をご確認ください」という趣旨の一文のみを返す。
5. ${PROMPT_INJECTION_GUARD_RULE_BODY}`;

/**
 * 注入検知時のフォールバック案内文(FR-046)。施設一覧はタグベース検索で表示し続けるため、
 * 「AI紹介文だけを行わなかった」ことを伝える。
 */
export const INJECTION_GUARD_FALLBACK_MESSAGE =
  "ご入力の相談内容に、AIへの指示や設定の変更を求める文章が含まれている可能性があるため、AIによる紹介文の生成は行わず、条件に合う施設の一覧のみを表示しています。";

export interface RecommendFacilityFact {
  name: string;
  description: string | null;
}

/**
 * 施設1件分の「理由文」生成プロンプトを組み立てる。
 * 事実情報(施設名・説明)は D1 の値をそのまま LLM へ渡すが、モデルにこれらの値を
 * 新規生成させる意図ではなく、あくまで理由文を書くための参考情報として渡す(FR-042 AC-2)。
 */
export function buildFacilityNotePrompt(userQuery: string, facility: RecommendFacilityFact): string {
  return `以下は、支援情報を探している利用者の相談内容と、候補となる施設の事実情報です。
非診断ガードの指示に従い、「この施設が相談内容に合いそうな理由」を1〜2文の短い日本語で書いてください。
出力には施設名・電話番号・住所・URL を含めず、理由の文章のみを返してください。

【利用者の相談内容】
${wrapUserInput(userQuery)}

【施設の事実情報】
施設名: ${facility.name}
説明: ${facility.description ?? "(説明なし)"}`;
}
