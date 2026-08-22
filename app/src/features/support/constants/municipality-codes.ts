// 東京都62区市町村 → 全国地方公共団体コード(JISコード5桁)対応表(全国版移行 Phase 1、
// municipality_code の第一級化)。
//
// コードの出典は総務省の全国地方公共団体コード。特別区は13101〜13123の完全連番(東京都公式区分順と
// 一致)、市部・町村部のコード帯は東京都の支庁区分と対応する(欠番13216・13217・13226は
// 田無市・保谷市→西東京市13229、秋川市→あきる野市13228 の合併による廃止コード)。
//
// `Record<Municipality, string>` 型により、MUNICIPALITIES(./municipalities.ts)と1件でも
// キーがズレるとコンパイルエラーになる(キー欠落・タイプミスを機械的に検出するための意図的な制約)。
// 既存の MUNICIPALITIES 定数は変更しない。
//
// facilities.municipality='東京都'(都全域が対象の広域窓口)は BROAD_AREA_MUNICIPALITY_CODE を使う。
// バックフィル用のマイグレーション(app/db/migrations/0028-add-municipality-code.sql)は、
// この62件+広域を静的な CASE 文として直接書き下している(このファイルからの自動生成ではない)。

import type { Municipality } from "./municipalities";
import { TOKYO_MUNICIPALITY_REGISTRY } from "./municipality-registry";

/**
 * 東京都の広域窓口(facilities.municipality='東京都')に対応するコード。
 * 総務省の全国地方公共団体コード上の都道府県代表行(東京都=130001)の5桁表記に対応する規約値。
 * 「XX000」の形式は他都道府県展開時も「その県の広域窓口」として同一規約で拡張できる。
 */
export const BROAD_AREA_MUNICIPALITY_CODE = "13000";

/** 東京都62区市町村(区→市→町村、MUNICIPALITIES と同順)の名称→コード対応表。 */
export const TOKYO_MUNICIPALITY_CODE_BY_NAME: Record<Municipality, string> = Object.fromEntries(
  TOKYO_MUNICIPALITY_REGISTRY.map((entry) => [entry.name, entry.code]),
) as Record<Municipality, string>;

/**
 * 自治体名(62区市町村のいずれか、または広域窓口の"東京都")からコードへ変換する。
 * いずれにも一致しない場合は null を返す(z.enum(MUNICIPALITIES) で検証済みの入力では
 * 通常起きないが、型を信用しすぎない防御として null を許容する)。
 */
export function municipalityToCode(name: string): string | null {
  if (name === "東京都") return BROAD_AREA_MUNICIPALITY_CODE;
  return (TOKYO_MUNICIPALITY_CODE_BY_NAME as Record<string, string | undefined>)[name] ?? null;
}
