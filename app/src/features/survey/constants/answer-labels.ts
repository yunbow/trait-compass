import type { AnswerValue } from "@/features/survey/schema/question";

/**
 * 回答値の3件法ラベル(FR-012): よくある=2 / ときどきある=1 / ほとんどない=0。
 * TICKET-0005(スコアリング)・TICKET-0007(アンケート画面)から共通利用する。
 *
 * 発生頻度のみを尋ねる(「困っているかどうか」は混ぜない)。以前は helpText に
 * 「困りごとにつながっている」等の困り度を併記していたが、これだと「頻繁にあるが
 * 困っていない」「まれだが困ったときはかなり困る」人がどちらを選ぶべきか分からなく
 * なるため、頻度のみの表現に統一した。困っているかどうかは結果画面・相談メモ側で扱う。
 */
export const ANSWER_VALUE_LABELS: Record<AnswerValue, string> = {
  2: "よくある",
  1: "ときどきある",
  0: "ほとんどない",
};

/**
 * UI 表示順(よくある → ときどきある → ほとんどない)で並んだ回答選択肢。
 */
export const ANSWER_OPTIONS: ReadonlyArray<{ value: AnswerValue; label: string; helpText: string }> = [
  { value: 2, label: ANSWER_VALUE_LABELS[2], helpText: "日常的にある、または最近も何度かある" },
  { value: 1, label: ANSWER_VALUE_LABELS[1], helpText: "たまにある、または場面によってある" },
  { value: 0, label: ANSWER_VALUE_LABELS[0], helpText: "ほぼない" },
];
