import type { LlmClient, LlmGenerateOptions, LlmGenerateResult } from "../llm-client";

// 開発・テスト用の決定的な `LlmClient` 実装。
// 通常開発では mock を既定にし、生成結果の形だけを固定して UI と安全ガードを検証する(FR-041)。
//
// クラウド課金・外部送信を一切発生させない。プロンプトの内容によって応答文言を変えないのは、
// 「生成結果の形(構造)だけを固定して UI 側の表示・エラーハンドリングを検証する」という
// 目的のため意図的な仕様(応答内容の妥当性検証は結合確認時に Vertex 実装で行う)。

const FIXED_RESPONSE_TEXT =
  "[mock] これはテスト用の固定応答です。実際の生成 AI 呼び出しは行われていません。";

export class MockLlmClient implements LlmClient {
  async generate(_prompt: string, _opts?: LlmGenerateOptions): Promise<LlmGenerateResult> {
    return { text: FIXED_RESPONSE_TEXT };
  }
}

/** テストや呼び出し元が固定応答の内容を参照できるように公開する。 */
export const MOCK_LLM_RESPONSE_TEXT = FIXED_RESPONSE_TEXT;
