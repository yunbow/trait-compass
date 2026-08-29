// 相談分野タグ(tags)クエリパラメータのASCII ID変換(受動的プライバシー対策)。
//
// 従来 `?tags=対人・コミュニケーション,こころ・感情` のように相談分野タグの日本語ラベルを
// そのままURLへ載せていたが、ブラウザ履歴・共有リンク・スクリーンショット経由で
// 「相談内容の傾向」が露出しうる(受動的プライバシーリスク)。本ファイルはtagsクエリの値のみを
// 短いASCII ID(例: social, emotion)に変換し、URL上に日本語の相談分野を残さないようにする。
//
// ハードカットオーバー方式: 旧仕様の日本語ラベルとの互換は維持しない。旧URLの日本語値は
// 単に未知の値として無視され、parseSupportTagsParam 側の既存フェイルセーフ(空配列=「全般」扱い)
// でそのまま吸収される。

import type { SupportTag } from "./category-tag-mapping";

/** 相談分野タグ(SupportTag) → URL用ASCII IDの対応表。SUPPORT_TAGS の全件を過不足なく網羅する(型 satisfies で保証)。 */
export const SUPPORT_TAG_URL_IDS = {
  "対人・コミュニケーション": "social",
  "こころ・感情": "emotion",
  "不注意・段取り": "attention",
  "感覚": "sensory",
  "学習・からだ": "learning",
  "こだわり": "routine",
} as const satisfies Record<SupportTag, string>;

export type SupportTagUrlId = (typeof SUPPORT_TAG_URL_IDS)[SupportTag];

const SUPPORT_TAG_URL_ID_SET: ReadonlySet<string> = new Set(Object.values(SUPPORT_TAG_URL_IDS));

/** 文字列が既知のURL用IDかどうかを判定する型ガード。旧仕様の日本語ラベルやその他未知の値には false を返す。 */
export function isSupportTagUrlId(value: string): value is SupportTagUrlId {
  return SUPPORT_TAG_URL_ID_SET.has(value);
}

/** URL用ID(SupportTagUrlId)を対応する相談分野タグへ変換する。 */
export function decodeSupportTagUrlId(id: SupportTagUrlId): SupportTag {
  return (Object.entries(SUPPORT_TAG_URL_IDS) as Array<[SupportTag, SupportTagUrlId]>).find(([, value]) => value === id)![0];
}

/** 相談分野タグの配列を、順序を保ったままカンマ区切りのURL用IDへ変換する純関数(例: ["感覚"] → "sensory")。空配列は空文字を返す。 */
export function encodeSupportTagsParam(tags: readonly SupportTag[]): string {
  return tags.map((tag) => SUPPORT_TAG_URL_IDS[tag]).join(",");
}

/** URLSearchParams に tags クエリをASCII IDで設定する共通処理。tags が空の場合は既存の tags クエリを削除し、「全般」扱い(クエリ無し)にする(results-url.ts の各ビルダー・SupportInputForm と方針を統一)。 */
export function setSupportTagsParam(query: URLSearchParams, tags: readonly SupportTag[]): void {
  if (tags.length > 0) {
    query.set("tags", encodeSupportTagsParam(tags));
  } else {
    query.delete("tags");
  }
}

/**
 * tags クエリの「明示的に指定なし(全般)」を表す予約値(2026-08是正)。
 *
 * `/support/results` から `/result/prepare`・`/result/recommend` へ遷移する際、tags が空
 * (=「全般」を選んでいる)場合に `setSupportTagsParam` のようにクエリ自体を省略すると、
 * 「そもそも `/support` を経由していない(クエリという概念が無い)直接遷移」と区別が付かなくなる。
 * 後者は端末に残っている自己チェック結果由来のタグへフォールバックしてよいが、前者(明示的な
 * 「全般」)はフォールバックすべきではない(端末に古い自己チェック結果が残っていると、
 * 無関係な相談分野タグが復活してしまう)。この2つを区別するため、`/support/results` 発の
 * 遷移では tags が空でも `NO_TAGS_EXPLICIT_VALUE` を明示的にクエリへ残す
 * (`setSupportTagsParamExplicit` 参照)。
 */
export const NO_TAGS_EXPLICIT_VALUE = "none";

/**
 * `setSupportTagsParam` と異なり、tags が空でも `tags` クエリ自体を省略しない版。
 * `/result/prepare`・`/result/recommend` への遷移URL(`buildPrepareHref`・`buildRecommendHref`)
 *専用(NO_TAGS_EXPLICIT_VALUE のドキュメント参照)。
 */
export function setSupportTagsParamExplicit(query: URLSearchParams, tags: readonly SupportTag[]): void {
  query.set("tags", tags.length > 0 ? encodeSupportTagsParam(tags) : NO_TAGS_EXPLICIT_VALUE);
}
