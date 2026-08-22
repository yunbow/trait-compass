// 制度共通の定型質問(TICKET-0048)のプロンプト構築。
//
// 非診断ガード(FR-044, NFR-51)は既存の ai-summary/recommend/prepare の各 prompt.ts と同じ方針を
// 踏襲する。加えて、recommend の RECOMMEND_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION と同じ考え方で
// 「与えられた根拠データ以外の事実を作り出さない」制約を明示する(RAG の忠実性、AC-3)。
// 出力側の最終防波堤は ai-summary/services/output-guard.ts(禁止語チェック)。
//
// ルール1・ルール2の文言は src/lib/ai/non-diagnostic-policy.ts を単一情報源とする。

import type { InstitutionKnowledgeRow } from "@/features/ask-ai/services/knowledge";
import {
  NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS,
  NON_DIAGNOSTIC_RULE_VOCABULARY,
} from "@/lib/ai/non-diagnostic-policy";

export const INSTITUTION_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION = `あなたは、発達特性に関する制度・手続きについて案内するアシスタントです。次のルールを厳守してください。

${NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS}
${NON_DIAGNOSTIC_RULE_VOCABULARY}
3. 回答は必ず与えられた根拠データ(データセットの説明文)の範囲内で書く。根拠データに無い制度名・
   金額・手続き方法・連絡先を新たに作り出したり、一般論として断定したりしない。
4. 根拠データだけでは質問に十分答えられない場合は、その旨を伝えたうえで一般的な相談窓口への
   相談を促す(架空の情報で埋めない)。
5. 出力は日本語で、2〜4文程度の簡潔な文章とする。`;

/**
 * 制度共通の質問への回答生成プロンプトを組み立てる。
 * 根拠データ(低リスクデータの説明文)を明示し、「この範囲内でのみ回答する」ことを指示する
 * (RAG の忠実性、AC-3)。
 */
export function buildInstitutionAnswerPrompt(questionLabel: string, evidence: readonly InstitutionKnowledgeRow[]): string {
  const evidenceBlock = evidence
    .map((row, index) => `${index + 1}. 【${row.name}】${row.description}`)
    .join("\n");

  return `以下は、発達特性に関する制度・支援についての定型質問と、根拠として使ってよいデータ
(低リスクデータの説明文)です。非診断ガードの指示に従い、根拠データの範囲内で質問に回答してください。

【質問】${questionLabel}

【根拠データ】
${evidenceBlock}`;
}
