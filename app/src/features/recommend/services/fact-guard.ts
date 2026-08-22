// LLM 生成の理由文(aiNote)に対する捏造検知ガード(TICKET-0023 AC-2)。
//
// 事実情報(施設名・電話番号・住所・URL)は route.ts が常に D1 の値のみを表示に使うため、
// aiNote の内容が表示上の事実情報を上書きすることは構造的に起こり得ない。
// それでも aiNote 自体の文中に「実在しない電話番号」のような捏造が含まれていると、
// 利用者がその文面を読んで誤った情報を信じるおそれがあるため、多層防御として
// 電話番号らしき文字列を検出し、D1 の実際の電話番号と一致しない場合は捏造とみなす。
//
// TICKET-0024(RAG 定量評価)向けに、同じ考え方(「テキスト中の事実情報らしき文字列が、
// D1 由来の許可集合に含まれるか」)を URL・施設名にも拡張する(Faithfulness 評価の
// エンティティ突合、NFR-73②)。呼び出し元(eval/generation.eval.ts)は施設ごとの
// D1 由来の値(phone/url/施設名一覧)を許可集合として渡す。

const PHONE_LIKE_PATTERN = /0\d{1,4}-\d{1,4}-\d{3,4}/g;

/**
 * テキスト中に「D1 の実際の電話番号と一致しない、電話番号らしき文字列」が含まれるかを判定する。
 * `actualPhone` が null(D1 に電話番号が無い施設)の場合、電話番号らしき文字列が1つでも
 * 含まれていれば捏造とみなす。
 */
export function containsFabricatedPhone(text: string, actualPhone: string | null): boolean {
  const matches = text.match(PHONE_LIKE_PATTERN);
  if (!matches) return false;
  return matches.some((match) => match !== actualPhone);
}

// URL らしき文字列(http(s)://始まり、日本語の句読点・閉じ括弧等の直前で打ち切る)。
const URL_LIKE_PATTERN = /https?:\/\/[^\s、。」』\])）]+/g;

/**
 * テキスト中に「D1 由来の URL 集合に含まれない、URL らしき文字列」が含まれるかを判定する
 * (Faithfulness 評価: エンティティ突合)。`actualUrls` は当該文脈で正当とみなす URL の集合
 * (例: 対象施設の url・sourceUrl、または候補施設全体の URL 集合)。
 * 文末の句読点が誤って含まれてしまうケースを吸収するため、末尾の全角句読点を除去した形でも
 * 突合する。
 */
export function containsFabricatedUrl(text: string, actualUrls: readonly (string | null)[]): boolean {
  const matches = text.match(URL_LIKE_PATTERN);
  if (!matches) return false;

  const allowed = new Set(actualUrls.filter((url): url is string => url !== null));
  return matches.some((match) => {
    const trimmed = match.replace(/[.,、。]+$/, "");
    return !allowed.has(match) && !allowed.has(trimmed);
  });
}

/**
 * テキスト中に「対象施設とは異なる、他の施設名」が含まれるかを判定する(Faithfulness 評価:
 * 施設の取り違え・混同の検知)。`actualName` が対象施設の正しい名称、`otherNames` は
 * D1 由来の他施設名の集合(候補一覧全体の name など)。
 */
export function containsFabricatedFacilityName(
  text: string,
  actualName: string,
  otherNames: readonly string[],
): boolean {
  return otherNames.some((name) => name !== actualName && name.length > 0 && text.includes(name));
}

// 因果断定文型の検出(TICKET-0060, SNS-D05: 相関と因果の峻別)。
//
// 「○○の傾向が高いため△△が原因です」のように、相関(スコア・傾向の高さ)を因果(原因)
// として断定する文型は、上の3関数がカバーする「事実情報らしき文字列の捏造」とは異なる種類の
// リスクである(電話番号・URL・施設名のように許可集合との突合はできない)。そのため文字列走査
// ベースの文型パターン一致(既存の PHONE_LIKE_PATTERN・URL_LIKE_PATTERN と同じ方針)で検出する。
const CAUSAL_ASSERTION_PATTERNS: readonly RegExp[] = [
  /ため.{0,20}が原因/, // 「〜の傾向が高いため△△が原因です」
  /が原因(です|であり|となっ|だ)/, // 「〜が原因です/であり/となって/だ」
  /によって.{0,20}(引き起こ|生じ|もたらされ)/, // 「〜によって引き起こされ/生じ/もたらされ」
];

// 否定・非該当を明示する文脈。
// 「原因ではありません」「原因かどうかは専門家へ」のように因果を断定しない・専門家へ判断を
// 委ねる文までは誤検出しない(過度に複雑にせず、文中にこれらの語を含むかどうかの単純走査に
// 留める)。
const CAUSAL_NEGATION_MARKERS: readonly string[] = [
  "ではありません",
  "ではない",
  "ではなく",
  "とは限りません",
  "とは言い切れません",
  "かどうかは",
];

/**
 * テキスト(文単位、句点区切り)に因果断定文型が含まれるかを判定する純関数(AC-1・AC-2)。
 * 否定・非該当を明示する文(CAUSAL_NEGATION_MARKERS を含む文)は対象外とする(AC-5)。
 *
 * 呼び出しポイント: `src/app/api/recommend/route.ts` の aiNote 生成後、`violatesOutputGuard`/
 * `containsFabricatedPhone` と同じ出力ガードとして組み込み済み(AC-4)。同様に
 * `src/app/api/explain/route.ts`(FR-043)、`src/app/api/ask/route.ts`(institution 経路、
 * LLM を呼ぶ唯一の経路)にも `violatesOutputGuard` と並べて組み込み済み。
 */
export function containsCausalAssertion(text: string): boolean {
  return text.split("。").some((sentence) => {
    if (CAUSAL_NEGATION_MARKERS.some((marker) => sentence.includes(marker))) return false;
    return CAUSAL_ASSERTION_PATTERNS.some((pattern) => pattern.test(sentence));
  });
}
