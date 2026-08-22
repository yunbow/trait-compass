// 相談準備アシスタント(TICKET-0046)の「伝えるとよいことチェックリスト」「当日の流れ/持ち物」
// 「聞いておきたいこと候補」を組み立てる純関数群。
//
// これらは LLM を介さず、選択式タグに基づく決定的テンプレートで組み立てる(services/prompt.ts
// のコメントを参照)。決定的テンプレートのため、非診断ガード(NFR-51)・捏造防止(fact-guard)の
// 対象外だが、文言自体が禁止語(src/lib/copy/banned-words.ts)を含まないことは
// copy-lint(src/lib/__tests__/copy-lint.test.ts)と本ファイルのユニットテストの双方で担保する。
//
// D1/LLM への実アクセスを含まないため、ユニットテストで担保する(NFR-72)。

import type { SupportTag } from "@/features/support/services/category-tag-mapping";

/** すべての相談準備メモに共通で含める基本チェックリスト。 */
const BASE_CHECKLIST_ITEMS: readonly string[] = [
  "困っている場面(いつ・どこで・誰といる時か)を具体的に伝える",
  "困りごとがどれくらいの頻度で起きているかを伝える",
  "これまでに試した工夫や、その結果を伝える",
  "相談したいことの優先順位(一番困っていることから)を決めておく",
];

/** 困りごとタグごとの追加チェック項目。基本項目に重複なく追加する。 */
const TAG_CHECKLIST_ITEMS: Partial<Record<SupportTag, readonly string[]>> = {
  "対人・コミュニケーション": ["対人関係でのやり取りのすれ違いが起きた具体例を伝える"],
  "こころ・感情": ["気持ちの波や落ち込みが出やすい時期・きっかけを伝える"],
  "不注意・段取り": ["忘れ物・段取りのつまずきが仕事や生活に与えている影響を伝える"],
  感覚: ["音・光・肌触りなど、負担に感じやすい感覚があれば伝える"],
  "学習・からだ": ["学習や運動でつまずきやすい場面を伝える"],
  こだわり: ["切り替えが難しい場面や、こだわりが強く出る場面を伝える"],
};

/** すべての相談準備メモに共通で含める、当日の流れ・持ち物の案内。 */
const BASE_FLOW_ITEMS: readonly string[] = [
  "受付で氏名・相談内容の概要を伝える",
  "相談員との面談(困りごとの聞き取り)",
  "今後の案内(必要に応じて他の窓口や制度の紹介)",
  "持ち物の例: 筆記用具、これまでの相談記録や連絡先メモ、本人確認書類",
];

/** すべての相談準備メモに共通で含める、聞いておきたいことの基本候補。 */
const BASE_QUESTION_ITEMS: readonly string[] = [
  "この窓口で相談できる範囲と、対応できない場合の紹介先を教えてほしい",
  "次にすべきことや、相談の頻度の目安を教えてほしい",
  "利用できる制度や支援があれば教えてほしい",
];

/** 困りごとタグごとの追加の質問候補。 */
const TAG_QUESTION_ITEMS: Partial<Record<SupportTag, readonly string[]>> = {
  "対人・コミュニケーション": ["対人関係で使える具体的な工夫の例があれば教えてほしい"],
  "こころ・感情": ["気持ちが不安定な時にすぐ相談できる連絡先があれば教えてほしい"],
  "不注意・段取り": ["忘れ物・段取りを助ける具体的な工夫の例があれば教えてほしい"],
  感覚: ["感覚の負担を減らす環境調整の例があれば教えてほしい"],
  "学習・からだ": ["学習や運動の支援につながる窓口があれば教えてほしい"],
  こだわり: ["切り替えを助ける具体的な工夫の例があれば教えてほしい"],
};

/** 重複を除いた配列を返す小さなヘルパー(順序は先勝ちで維持)。 */
function unique(items: readonly string[]): string[] {
  return [...new Set(items)];
}

/**
 * 選択された困りごとタグに基づいて「伝えるとよいことチェックリスト」を組み立てる(AC-1)。
 * 基本項目 + タグごとの追加項目(重複除去)の順で返す。
 */
export function buildPrepareChecklist(tags: readonly SupportTag[]): string[] {
  const tagItems = tags.flatMap((tag) => TAG_CHECKLIST_ITEMS[tag] ?? []);
  return unique([...BASE_CHECKLIST_ITEMS, ...tagItems]);
}

/**
 * 「当日の流れ/持ち物」を組み立てる(AC-1)。現状はタグに依存しない共通の案内のみを返す
 * (相談窓口ごとに実際の流れは異なるため、断定的な記載を避け一般的な目安に留める)。
 */
export function buildPrepareFlow(): string[] {
  return [...BASE_FLOW_ITEMS];
}

/**
 * 選択された困りごとタグに基づいて「聞いておきたいこと候補」を組み立てる(AC-1)。
 */
export function buildPrepareQuestions(tags: readonly SupportTag[]): string[] {
  const tagItems = tags.flatMap((tag) => TAG_QUESTION_ITEMS[tag] ?? []);
  return unique([...BASE_QUESTION_ITEMS, ...tagItems]);
}
