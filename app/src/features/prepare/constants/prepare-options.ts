// 相談メモ(`/result/prepare`、PreparePanel)の追加選択式フィールド用の選択肢定数。
//
// 相談メモ入力は自由記述を一切持たない(AC-2、prepare.ts 冒頭コメント参照、危機介入回避構造の
// 維持)。ここで定義する7項目もすべて選択式(単一選択の value/label ペア、または複数選択の
// タグ配列)であり、ユーザーが任意の文字列を入力できる余地は作らない。
//
// **最重要の安全要件**: いずれの選択肢文言にも、危機介入シグナル(自傷・希死念慮・自殺等、
// `@/features/ai-summary/services/crisis-detection.ts` の `containsCrisisSignal` が使う
// キーワードリスト参照)を想起させる語句を含めない。選択肢を追加・変更する際は必ず
// 同ファイルのキーワード一覧と照合すること。

/**
 * 困っている場面(複数選択可)。SUPPORT_TAGS
 * (`@/features/support/services/category-tag-mapping.ts`)と同様、診断・症状を想起させる
 * 語彙は使わず、生活場面を表す語のみで構成する。
 */
export const PREPARE_SITUATION_TAGS = [
  "家庭で",
  "学校・園で",
  "職場で",
  "人と話すとき",
  "一人で作業・勉強するとき",
  "初めての場所や急な変更があるとき",
] as const;
export type PrepareSituationTag = (typeof PREPARE_SITUATION_TAGS)[number];

/** いつから困っているか(単一選択)。期間の目安を選ぶだけで、具体的な時期の自由記述は求めない。 */
export const PREPARE_DURATION_VALUES = ["recent", "few-years", "since-childhood", "unsure"] as const;
export type PrepareDuration = (typeof PREPARE_DURATION_VALUES)[number];

/** 画面表示用ラベル。表示順もこのまま採用する(最近→数年前→子どもの頃→不明)。 */
export const PREPARE_DURATION_OPTIONS: { value: PrepareDuration; label: string }[] = [
  { value: "recent", label: "最近(ここ数ヶ月)" },
  { value: "few-years", label: "数年前から" },
  { value: "since-childhood", label: "子どもの頃から" },
  { value: "unsure", label: "はっきりとは分からない" },
];

/**
 * 現在の生活・就労・就学状況(単一選択)。目的選択画面のライフステージ区分
 * (`@/features/support/services/lifestage-mapping.ts`)より粒度を細かくし、相談メモ上で
 * 相手に伝えやすい状況表現を選べるようにする。
 */
export const PREPARE_LIFE_STATUS_VALUES = [
  "preschool",
  "elementary-junior-high",
  "high-school",
  "university-vocational",
  "working",
  "on-leave",
  "job-seeking",
  "other",
] as const;
export type PrepareLifeStatus = (typeof PREPARE_LIFE_STATUS_VALUES)[number];

/** 画面表示用ラベル。表示順もこのまま採用する(就学段階→就労→休職→求職→その他)。 */
export const PREPARE_LIFE_STATUS_OPTIONS: { value: PrepareLifeStatus; label: string }[] = [
  { value: "preschool", label: "在学中(幼稚園・保育園)" },
  { value: "elementary-junior-high", label: "在学中(小学校・中学校)" },
  { value: "high-school", label: "在学中(高校)" },
  { value: "university-vocational", label: "在学中(大学・専門学校)" },
  { value: "working", label: "就労中" },
  { value: "on-leave", label: "休職中" },
  { value: "job-seeking", label: "求職中" },
  { value: "other", label: "その他" },
];

/**
 * 相談したい内容(単一選択)。窓口側が最初に把握したい「相談の主目的」を選択式で示す。
 * 診断名や症状の断定を求めるものではなく、相談の入り口(窓口探し/制度利用/検査/配慮相談)を
 * 選ぶだけの語彙にする(NFR-51 と同じ方針)。
 */
export const PREPARE_CONSULT_PURPOSE_VALUES = [
  "find-consultation-desk",
  "use-support-program",
  "diagnosis-checkup",
  "school-workplace-accommodation",
  "other",
] as const;
export type PrepareConsultPurpose = (typeof PREPARE_CONSULT_PURPOSE_VALUES)[number];

/** 画面表示用ラベル。表示順もこのまま採用する。 */
export const PREPARE_CONSULT_PURPOSE_OPTIONS: { value: PrepareConsultPurpose; label: string }[] = [
  { value: "find-consultation-desk", label: "相談窓口を知りたい" },
  { value: "use-support-program", label: "制度・支援を利用したい" },
  { value: "diagnosis-checkup", label: "診断・検査について知りたい" },
  { value: "school-workplace-accommodation", label: "学校・職場での対応について相談したい" },
  { value: "other", label: "その他" },
];

/** 希望する連絡方法(単一選択)。窓口からの連絡手段の希望を選択式で伝えるための項目。 */
export const PREPARE_CONTACT_METHOD_VALUES = ["phone", "in-person", "email", "no-preference"] as const;
export type PrepareContactMethod = (typeof PREPARE_CONTACT_METHOD_VALUES)[number];

/** 画面表示用ラベル。表示順もこのまま採用する。 */
export const PREPARE_CONTACT_METHOD_OPTIONS: { value: PrepareContactMethod; label: string }[] = [
  { value: "phone", label: "電話" },
  { value: "in-person", label: "対面" },
  { value: "email", label: "メール" },
  { value: "no-preference", label: "特に希望なし" },
];

/**
 * 配慮事項(複数選択可)。窓口とのやり取りで事前に伝えておきたい配慮の希望を選択式で示す。
 * 「〜が苦手」「〜を希望」という生活場面での伝え方に統一し、診断・症状を想起させる語彙は使わない。
 */
export const PREPARE_ACCOMMODATION_TAGS = [
  "電話が苦手",
  "対面が苦手(オンライン・書面を希望)",
  "筆談・メモでのやり取りを希望",
  "ゆっくり・繰り返し説明してほしい",
] as const;
export type PrepareAccommodationTag = (typeof PREPARE_ACCOMMODATION_TAGS)[number];

/**
 * これまで利用した支援(複数選択可)。窓口が重複相談・引き継ぎ状況を把握しやすいよう、
 * 過去の相談・受診・利用歴の有無を選択式で示す(具体的な機関名・時期の自由記述は求めない)。
 */
export const PREPARE_PRIOR_SUPPORT_TAGS = [
  "相談窓口に相談したことがある",
  "医療機関を受診したことがある",
  "療育・支援を利用したことがある",
] as const;
export type PriorSupportTag = (typeof PREPARE_PRIOR_SUPPORT_TAGS)[number];
