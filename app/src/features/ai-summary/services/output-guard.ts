// LLM 応答に対する出力ガード(TICKET-0022 AC-3, NFR-51)。
//
// プロンプト側の指示(services/prompt.ts の NON_DIAGNOSTIC_SYSTEM_INSTRUCTION)だけでは
// モデルが指示に反した断定表現を出力する可能性を排除できないため、応答をサーバー側で
// 検査し、禁止語(診断/判定/あなたは○○です等の断定表現)を含む場合は表示せず、
// 安全な定型文にフォールバックする(出力ガード。route.ts が呼び出す最終防波堤)。

const FORBIDDEN_OUTPUT_PATTERNS: RegExp[] = [
  /診断/,
  /判定/,
  // 「あなたは○○です」「あなたは○○障害です」のような断定表現。
  /あなたは.+です/,
  /罹患/,
  /(ADHD|ASD|LD|DCD)(である|です)/,
];

/**
 * LLM 応答テキストが禁止語・断定表現を含むかを判定する。
 */
export function violatesOutputGuard(text: string): boolean {
  return FORBIDDEN_OUTPUT_PATTERNS.some((pattern) => pattern.test(text));
}

/**
 * 出力ガードに抵触した場合に表示する安全な定型文。
 * 危機介入案内(CRISIS_GUIDANCE_TEXT)とは異なり、危機的内容が理由ではないため
 * 相談窓口の案内ではなく「表示を見合わせた」旨のみを伝える。
 */
export const OUTPUT_GUARD_FALLBACK_TEXT =
  "安全に配慮し、今回は要約の表示を見合わせました。恐れ入りますが、入力内容をご自身で読み返していただくか、" +
  "表現を変えて再度お試しください。";
