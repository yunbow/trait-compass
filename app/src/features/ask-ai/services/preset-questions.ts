// 「AIに質問する」定型質問マスタ(TICKET-0048)。
//
// 自由記述は一切許可しない設計(AC-2)のため、質問文はすべてこのファイル内の固定配列として
// 定義する。カテゴリ(窓口向け/制度向け)ごとにリストを分ける(実装方針 §3)。
//
// 危機介入ガードの代替方式(実装方針 §5): 自由記述由来のキーワード検知(crisis-detection.ts)は
// 選択式入力に対しては成立しないため、ここに列挙する質問文自体が危機介入を誘発しない
// (自傷・希死念慮等を想起させない)ことを設計上の前提とする「簡易な許可リスト方式」を採用する。
// 生成結果には既存の出力ガード(ai-summary/services/output-guard.ts)を必ず適用する
// (route.ts を参照。TICKET-0046 と同じ多層防御の考え方)。

/** 質問の対象種別。窓口固有(D1事実情報のみ)か、制度共通(低リスクデータの解説文層)か、学校固有(D1手動調査データのみ)か。 */
export const ASK_TARGET_TYPES = ["facility", "institution", "school"] as const;
export type AskTargetType = (typeof ASK_TARGET_TYPES)[number];

export interface PresetQuestion {
  id: string;
  targetType: AskTargetType;
  label: string;
}

/** 窓口カード(FacilityCard)向けの定型質問。回答は対象施設の D1 事実情報のみから構成する(AC-3)。 */
export const FACILITY_PRESET_QUESTIONS: readonly PresetQuestion[] = [
  { id: "facility-age-range", targetType: "facility", label: "対象年齢を教えてください" },
  { id: "facility-contact", targetType: "facility", label: "連絡先・申し込み方法を教えてください" },
  { id: "facility-overview", targetType: "facility", label: "どんな窓口か概要を教えてください" },
];

/**
 * 制度共通の定型質問。回答は低リスクデータ(risk_level='low')の解説文層を根拠に生成する(AC-3)。
 * 特定の施設・制度カードに紐づかない一般的な質問のため `facilityId` は要求しない。
 */
export const INSTITUTION_PRESET_QUESTIONS: readonly PresetQuestion[] = [
  { id: "institution-how-to-apply", targetType: "institution", label: "利用するにはどうしたらいいですか" },
  { id: "institution-who-is-eligible", targetType: "institution", label: "どんな人が対象になりますか" },
  { id: "institution-cost", targetType: "institution", label: "費用はどのくらいかかりますか" },
];

/**
 * 学校情報カード(SchoolCard)向けの定型質問(掲載情報の訂正・更新報告の拡張と同時に追加)。
 * 回答は対象学校の D1 手動調査データ(school-info.ts の `fetchSchoolById`)のみから決定的に
 * 組み立てる(services/school-answer.ts。facility 経路と同じくLLMを介さない、AC-3と同じ設計)。
 */
export const SCHOOL_PRESET_QUESTIONS: readonly PresetQuestion[] = [
  { id: "school-fixed-class", targetType: "school", label: "固定学級(特別支援学級)はありますか" },
  { id: "school-resource-room", targetType: "school", label: "特別支援教室(通級)は利用できますか" },
  { id: "school-contact", targetType: "school", label: "連絡先・所在地を教えてください" },
  { id: "school-overview", targetType: "school", label: "どんな支援体制がある学校か教えてください" },
];

export const ALL_PRESET_QUESTIONS: readonly PresetQuestion[] = [
  ...FACILITY_PRESET_QUESTIONS,
  ...INSTITUTION_PRESET_QUESTIONS,
  ...SCHOOL_PRESET_QUESTIONS,
];

export const FACILITY_QUESTION_IDS = FACILITY_PRESET_QUESTIONS.map((q) => q.id) as [string, ...string[]];
export const INSTITUTION_QUESTION_IDS = INSTITUTION_PRESET_QUESTIONS.map((q) => q.id) as [string, ...string[]];
export const SCHOOL_QUESTION_IDS = SCHOOL_PRESET_QUESTIONS.map((q) => q.id) as [string, ...string[]];

/** questionId から定型質問を引く(未知の id は undefined。zod ホワイトリストで事前に弾かれる想定)。 */
export function findPresetQuestion(questionId: string): PresetQuestion | undefined {
  return ALL_PRESET_QUESTIONS.find((q) => q.id === questionId);
}
