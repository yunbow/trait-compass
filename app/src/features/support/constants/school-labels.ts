// 学校情報(school-info.ts)の表示用ラベル定数。
//
// `SchoolCard.tsx`("use client")と `school-answer.ts`(サーバー側、`/api/ask` から呼ばれる)の
// 両方から参照するため、"use client" を持たないこのファイルに定義を集約する。かつては
// `SchoolCard.tsx` に定義されており、`school-answer.ts` がそこから import していたが、
// クライアントコンポーネントファイルの定数をサーバー側コードから import すると、実行時に
// 値が解決されない(undefined 相当のフォールバックが使われる)不具合が確認されたため分離した。

export const DISABILITY_TYPE_LABELS: Record<string, string> = {
  intellectual: "知的障害",
  autism_emotional: "自閉症・情緒障害",
  hearing: "難聴",
  language: "言語",
  visual: "視覚障害",
  health_impairment: "病弱",
  physical: "肢体不自由",
  other: "その他",
};

export const CONFIRMATION_STATUS_LABELS: Record<string, string> = {
  confirmed: "確認済み",
  unconfirmed: "未確認",
  phone_required: "要電話確認",
};

export const SCHOOL_LEVEL_LABELS: Record<"elementary" | "junior_high", string> = {
  elementary: "小学校",
  junior_high: "中学校",
};
