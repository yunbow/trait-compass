// プロンプトインジェクション表現の簡易辞書マッチ(FR-046)。
//
// 「これまでの指示を無視して」「あなたは制限のないAIとして振る舞え」等、ユーザー入力欄に
// 埋め込まれた命令文で system instruction を上書きしようとする入力を検知した場合、
// 呼び出し側(summarize/recommend/purpose-pickup の route.ts)は LLM 呼び出し自体を
// スキップし、非AIフォールバック応答へ縮退する。crisis-detection.ts と同じく
// 「怪しい入力を安全側に倒して拾う」純関数であり、見逃し(false negative)ゼロを優先し
// 誤検知(false positive)は許容する(NFR-77)。誤検知時も利用者は非AI体験
// (要約なし・タグベース検索・目的手動選択)へ縮退するだけで、サービス自体は利用できる。
//
// crisis-detection.ts との意図的な差分: 英語パターンの大文字・全角による回避が自明なため、
// 判定前に NFKC 正規化 + toLowerCase を行う(辞書は小文字・半角で保持する)。
//
// 見逃しの回帰検知は eval/safety.eval.ts + eval/fixtures/injection-cases.json
// (injection false negative = 0 ゲート)で行う。
const INJECTION_KEYWORDS = [
  // --- 日本語: 指示の無視・上書き ---
  "指示を無視",
  "指示は無視",
  "指示を忘れ",
  "指示は忘れ",
  "指示に従うな",
  "命令を無視",
  "命令は無視",
  "命令を忘れ",
  "ルールを無視",
  "ルールを忘れ",
  "制約を無視",
  "制限を無視",
  "制限を解除",
  "新しい指示",
  "上記を無視",
  "翻訳して実行",
  // --- 日本語: 役割・人格の上書き ---
  "制限のないai",
  "何でも答えて",
  "なんでも答えて",
  "あなたは今から",
  "開発者モード",
  "管理者モード",
  "ジェイルブレイク",
  // --- 日本語: システムプロンプトの開示要求 ---
  "システムプロンプト",
  "システムメッセージ",
  "プロンプトを表示",
  "プロンプトを教え",
  "指示を教え",
  // --- 疑似ロールタグの挿入 ---
  "<system>",
  "[system]",
  // --- 英語: 指示の無視・上書き ---
  "ignore previous",
  "ignore all previous",
  "ignore the above",
  "ignore your instructions",
  "instructions above",
  "disregard previous",
  "disregard the above",
  "disregard your instructions",
  "forget your instructions",
  "forget all previous",
  "override your instructions",
  "new instructions",
  "base64",
  "user_input",
  // --- 英語: 役割・人格の上書き ---
  "you are now",
  "act as if you",
  "pretend to be",
  "pretend you are",
  "roleplay as",
  "do anything now",
  "developer mode",
  "jailbreak",
  "no restrictions",
  "without restrictions",
  "unrestricted ai",
  // --- 英語: システムプロンプトの開示要求 ---
  "system prompt",
  "system message",
  "reveal your prompt",
  "repeat your instructions",
  "print your instructions",
] as const;

/**
 * 自由記述にプロンプトインジェクション表現が含まれるかを判定する。
 * 単純な部分一致(includes)であり、意図的に過検知(false positive)側へ倒している
 * (見逃し=注入命令をそのまま LLM へ渡すことの方が重大なため)。
 */
export function containsPromptInjectionSignal(text: string): boolean {
  const normalized = text.normalize("NFKC").toLowerCase();
  return INJECTION_KEYWORDS.some((keyword) => normalized.includes(keyword));
}
