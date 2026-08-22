// ライフステージ別の目的選択肢(目的選択画面、`/support/purpose`)。
//
// 出典: 台東区の支援ナビゲーション設計調査で整理した「投入した17目的の一覧」表。
// `purposeId` → `id`、目的ラベル → `label` として、表の内容をそのまま転記したもの
// (新たな推測・言い換えは行わない)。台東区の想定ルート実データ
// (`data/manual/municipalities/13106-taito.yaml` の `supportPathways:`)がこの17目的を
// 前提に整備されているため、目的選択画面の選択肢もこの17件と一致させる。
//
// 表の対応関係(ライフステージ→目的数): 未就学児(preschool)6件、小学生・中学生
// (elementary-junior-high)4件、高校生(high-school)4件、大学生・専門学校生
// (university-vocational)/社会人(working-adult)共通3件。合計17件。

import type { Lifestage } from "@/features/support/services/lifestage-mapping";

export interface PurposeOption {
  id: string;
  label: string;
}

/** 未就学児(preschool)向けの目的6件。 */
const PRESCHOOL_PURPOSE_OPTIONS: PurposeOption[] = [
  { id: "consult-development", label: "まず発達について相談したい" },
  { id: "consult-nursery-trouble", label: "園での困りごとを相談したい" },
  { id: "use-day-service", label: "児童発達支援・療育を利用したい" },
  { id: "consult-medical-checkup", label: "医療機関や発達検査について知りたい" },
  { id: "consult-school-entry", label: "就学に向けて相談したい" },
  { id: "certificate-info", label: "手帳・受給者証について知りたい" },
];

/** 小学生・中学生(elementary-junior-high)向けの目的4件。 */
const ELEMENTARY_JUNIOR_HIGH_PURPOSE_OPTIONS: PurposeOption[] = [
  { id: "consult-school-trouble", label: "学校での困りごとを相談したい" },
  { id: "consult-transfer", label: "転学・特別支援学級について相談したい" },
  { id: "use-day-service", label: "放課後等デイサービスを利用したい" },
  { id: "certificate-info", label: "手帳・受給者証について知りたい" },
];

/** 高校生(high-school)向けの目的4件。 */
const HIGH_SCHOOL_PURPOSE_OPTIONS: PurposeOption[] = [
  { id: "consult-course", label: "進路・学校生活について相談したい" },
  { id: "use-day-service", label: "放課後等デイサービスを継続利用したい" },
  { id: "consult-employment", label: "就労について相談したい" },
  { id: "certificate-info", label: "手帳・受給者証について知りたい" },
];

/**
 * 大学生・専門学校生(university-vocational)/社会人(working-adult)共通の目的3件。
 * 05-taito-finalized-pathways.md に記載の通り、台東区の相談窓口はこの2ライフステージを
 * 区別しておらず(「乳幼児期/学齢期/成人期」の3区分運用)、想定ルートの内容も完全に同一のため、
 * 定数を1つに統一して両方のキーへ同じ配列を割り当てる(重複定義の回避)。
 */
const ADULT_PURPOSE_OPTIONS: PurposeOption[] = [
  { id: "consult-development-adult", label: "まず発達について相談したい" },
  { id: "certificate-medical-subsidy", label: "手帳・自立支援医療について知りたい" },
  { id: "consult-employment-adult", label: "就労について相談したい" },
];

/**
 * ライフステージ別の目的選択肢一覧。目的選択画面(`PurposeSelectionForm`)が
 * `PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage]` の各要素をボタンとして表示する。
 */
export const PURPOSE_OPTIONS_BY_LIFESTAGE: Record<Lifestage, PurposeOption[]> = {
  preschool: PRESCHOOL_PURPOSE_OPTIONS,
  "elementary-junior-high": ELEMENTARY_JUNIOR_HIGH_PURPOSE_OPTIONS,
  "high-school": HIGH_SCHOOL_PURPOSE_OPTIONS,
  "university-vocational": ADULT_PURPOSE_OPTIONS,
  "working-adult": ADULT_PURPOSE_OPTIONS,
};

/**
 * 「それ以外」を表す固定ID。具体的な目的のいずれにも当てはまらない場合の自由記述導線
 * (準備中)への遷移を表す。`PURPOSE_OPTIONS_BY_LIFESTAGE` に含まれる id とは重複しない。
 */
export const PURPOSE_OTHER_ID = "other";
