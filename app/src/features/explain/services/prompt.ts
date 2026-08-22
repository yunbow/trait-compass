// 上位カテゴリ解説(TICKET-0023, FR-043)のプロンプト構築。
//
// 非診断ガード(FR-044, NFR-51)は src/features/ai-summary/services/prompt.ts と同じ方針を
// 踏襲する。個人のスコア値・回答の生データは一切プロンプトに含めない(送信されるのは
// カテゴリ名+根拠質問文のみ、結果画面のプレビューと一致させる)。
//
// ルール1・ルール2の文言は src/lib/ai/non-diagnostic-policy.ts を単一情報源とする。

import type { CategoryEvidence } from "@/features/explain/services/category-evidence";
import {
  NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS,
  NON_DIAGNOSTIC_RULE_VOCABULARY,
} from "@/lib/ai/non-diagnostic-policy";

export const EXPLAIN_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION = `あなたは、発達特性の日常の困りごとチェックのAIパーソナライズ解説アシスタントです。次のルールを厳守してください。

${NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS}
${NON_DIAGNOSTIC_RULE_VOCABULARY}
3. 与えられたカテゴリと根拠質問文(fact-checked 済み)を踏まえ、そのカテゴリで見られやすい一般的な
   傾向を解説する。個人のスコアの値・順位には一切言及しない。
4. 出力は日本語で、カテゴリ全体を通して3〜6文程度の簡潔な文章とする。`;

/**
 * カテゴリ解説生成プロンプトを組み立てる。
 * 各カテゴリの説明文と、fact-checked 242件由来の根拠質問文(抜粋)を明示し、
 * 「これらを根拠として解説を書く」ことを指示する(FR-043 AC-3「根拠として引用」)。
 */
export function buildCategoryExplainPrompt(evidence: readonly CategoryEvidence[]): string {
  const sections = evidence
    .map((item) => {
      const questionsBlock =
        item.sampleQuestionTexts.length > 0
          ? item.sampleQuestionTexts.map((text, index) => `${index + 1}. ${text}`).join("\n")
          : "(根拠質問文なし)";

      return `【${item.label}】
${item.description}
根拠となる日常の困りごとチェック項目(fact-checked 済み、抜粋):
${questionsBlock}`;
    })
    .join("\n\n");

  return `以下は、発達特性の日常の困りごとチェックの結果画面でスコアが高めだった上位カテゴリと、
その根拠となる fact-checked 済みの日常の困りごとチェック項目(抜粋)です。非診断ガードの指示に従い、
これらのカテゴリについて一般的な傾向の補足解説を書いてください。

${sections}`;
}
