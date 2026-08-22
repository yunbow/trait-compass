// 非診断ガード(FR-044, NFR-51)のうち、複数機能の `*_SYSTEM_INSTRUCTION` に共通する
// 文言の単一情報源(SSOT)。
//
// 対象は「ルール1(医学的診断・断定の禁止)」「ルール2(語彙統一)」の2つで、いずれも
// src/features/{ai-summary,explain,recommend,prepare,purpose-pickup}/services/prompt.ts と
// src/features/ask-ai/services/institution-prompt.ts の計6ファイルで文言が重複していたもの。
// ルール1は6ファイル共通、ルール2は recommend/purpose-pickup の2ファイルのみ不使用
// (出力を事実情報の理由文/選択肢の id のみに絞る設計のため、語彙統一ルールの対象となる
// 「傾向・特性の説明文」自体を書かせないことに依拠する)。
//
// ルール3以降・危機介入時の指示・機能固有の指示は各 prompt.ts 側にそのまま残す(この
// ファイルへは移さない)。各 `*_SYSTEM_INSTRUCTION` は本ファイルの定数をテンプレート
// リテラルで前置する形で組み立てる。

/** ルール1: 医学的な「診断」「判定」・断定表現の禁止(6ファイル共通)。 */
export const NON_DIAGNOSTIC_RULE_NO_DIAGNOSIS =
  "1. 医学的な「診断」「判定」は行わない。「○○障害です」「あなたは○○です」のような断定表現も使わない。";

/** ルール2: 使ってよい語彙の統一(recommend/purpose-pickup は不使用)。 */
export const NON_DIAGNOSTIC_RULE_VOCABULARY =
  "2. 使ってよい語彙は「傾向」「特性」「日常の困りごとチェックの目安」に統一し、個別の疾病名や罹患の有無・重症度を断定しない。";
