import { z } from "zod";

import type { CategoryScores, GrayZoneMeta, OverlapCounts, TraitScores } from "@/features/survey/services/scoring";

/**
 * 結果共有 URL(TICKET-0009, FR-019)のエンコード/デコードを担う純関数群。
 *
 * NFR-32・AC-3 により、共有対象データは「カテゴリ別スコア」「特性別スコア」
 * 「gray-zone 件数」「重なり件数」の4種のみを持つ形にスキーマ・型の両方で固定する。
 * 自由記述(freeText 等)・地域情報・個々の回答値(questionId/answerValue)は
 * フィールドとして存在しないため、実装上これらを URL に含めることができない
 * (フィールドが無い = 混入不可能、という型レベルの保証)。
 */

const SHARE_VERSION = "v1";
const HASH_PARAM_KEY = "r";

/** カテゴリ/特性スコア1件分。0〜100 の整数、または未算出を表す null。 */
const scoreValueSchema = z.union([z.number().int().min(0).max(100), z.null()]);

/**
 * カテゴリ別スコア(10カテゴリ)。フィールド名を明示的に列挙することで、
 * `CategoryKeySchema`(`@/features/survey/schema/question`)の10カテゴリ以外(自由記述・
 * 地域等)をスキーマレベルでも受け付けない(`.strict()` により未知キーは検証エラー)。
 */
const CategoryScoresSchema = z
  .object({
    communication: scoreValueSchema,
    "social-reading": scoreValueSchema,
    "emotion-regulation": scoreValueSchema,
    "impulse-memory": scoreValueSchema,
    "executive-function": scoreValueSchema,
    "kindness-misread": scoreValueSchema,
    sensory: scoreValueSchema,
    motor: scoreValueSchema,
    learning: scoreValueSchema,
    "restricted-repetitive": scoreValueSchema,
  })
  .strict();

/** 特性別スコア(ASD/ADHD/LD/DCD の4件)。同様に `.strict()` で固定する。 */
const TraitScoresSchema = z
  .object({
    ASD: scoreValueSchema,
    ADHD: scoreValueSchema,
    LD: scoreValueSchema,
    DCD: scoreValueSchema,
  })
  .strict();

/**
 * 共有対象データのスキーマ本体。この4フィールド以外は存在し得ない
 * (AC-3: 自由記述・地域情報を「コード上でも保証」の実体)。
 */
export const ShareDataSchema = z
  .object({
    categoryScores: CategoryScoresSchema,
    traitScores: TraitScoresSchema,
    grayZoneCount: z.number().int().min(0),
    overlapCounts: z.record(z.string(), z.number().int().min(0)),
  })
  .strict();

export type ShareData = z.infer<typeof ShareDataSchema>;

/**
 * 特性別スコア(ASD/ADHD/LD/DCD)は常にこの値(全件 null)で共有データへ埋める。
 * 共有 URL の受信者側(`SharedResultView`)はもともと特性別スコアを表示しておらず、
 * 送信側のプレビュー(`ShareUrlSection`)にのみ表示されていたため、「診断カテゴリ名+
 * パーセンテージ」の組み合わせが送信者自身の画面に残ってしまっていた
 * (`tag-overlap.ts` で `/result` の主表示から診断名+パーセンテージの併記を排した
 * 対応と同じ理由)。これを避けるため、実際のスコア値を共有ペイロードへ転送しない。
 */
const NULL_TRAIT_SCORES: TraitScores = { ASD: null, ADHD: null, LD: null, DCD: null };

/**
 * `scoreSurvey()` の結果(または同形のデータ)から、共有対象データのみを取り出す。
 * `answers`(回答生値)を一切参照しないため、呼び出し側が誤って回答値を混入させる
 * 余地がない。
 *
 * `traitScores` は呼び出し側から渡された値に関わらず常に全件 null として埋める
 * (`NULL_TRAIT_SCORES` 参照)。特性別スコアを共有ペイロードから意図的に除外するための
 * ものであり、`TraitScoresSchema`・`ShareData` の型・デコード側 (`decodeShareValue` 等) は
 * 変更しない(`number | null` を許容するスキームのまま、値のみを固定する)。
 */
export function toShareData(scoreResult: {
  categoryScores: CategoryScores;
  traitScores: TraitScores;
  grayZoneMeta: GrayZoneMeta;
  overlapCounts: OverlapCounts;
}): ShareData {
  return {
    categoryScores: scoreResult.categoryScores,
    traitScores: NULL_TRAIT_SCORES,
    grayZoneCount: scoreResult.grayZoneMeta.grayZoneCount,
    overlapCounts: scoreResult.overlapCounts,
  };
}

function toBase64Url(json: string): string {
  const bytes = new TextEncoder().encode(json);
  let binary = "";
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  const base64 = btoa(binary);
  return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(base64url: string): string {
  // base64url は URL セーフのため `+`/`/` を使わず、パディング `=` も省略される。
  // atob() に渡す前に標準 base64 の形へ戻す。
  if (!/^[A-Za-z0-9_-]*$/.test(base64url)) {
    throw new Error("invalid base64url string");
  }
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * 共有データを `v1.<base64url(JSON)>` 形式の文字列にエンコードする。
 * バージョンプレフィックス(`v1`)は将来のスキーマ変更時に旧バージョンの
 * ハッシュを安全に区別・拒否するために付与する。
 */
export function encodeShareData(data: ShareData): string {
  const validated = ShareDataSchema.parse(data);
  const json = JSON.stringify(validated);
  return `${SHARE_VERSION}.${toBase64Url(json)}`;
}

/**
 * `encodeShareData()` の結果を `#r=...` 形式の URL ハッシュ文字列に組み立てる。
 * この文字列を `location.hash`/`history.replaceState` に渡すのは呼び出し側
 * (UI 側の明示操作ハンドラ)の責務とし、本関数自体は DOM に触れない純関数のまま保つ。
 */
export function buildShareHash(data: ShareData): string {
  return `#${HASH_PARAM_KEY}=${encodeShareData(data)}`;
}

/**
 * URL ハッシュ文字列(`#r=...` または `r=...`)から `r` パラメータの生値を取り出す。
 * パラメータ自体が存在しない場合は `null`(「共有 URL 由来かどうか」の判定に使う)。
 */
export function getShareHashParam(hash: string): string | null {
  const normalized = hash.startsWith("#") ? hash.slice(1) : hash;
  if (normalized.length === 0) {
    return null;
  }
  const params = new URLSearchParams(normalized);
  const raw = params.get(HASH_PARAM_KEY);
  return raw === null || raw === "" ? null : raw;
}

/**
 * `r` パラメータの生値(`v1.<base64url>`)から共有データを復元する。
 * バージョン不一致・base64 不正・JSON 破損・スキーマ不一致のいずれも例外を
 * 投げず `null` を返す(AC-8: 不正な値でクラッシュしたり通常結果として
 * 誤表示したりしない)。
 */
export function decodeShareValue(value: string): ShareData | null {
  try {
    const prefix = `${SHARE_VERSION}.`;
    if (!value.startsWith(prefix)) {
      return null;
    }
    const encoded = value.slice(prefix.length);
    const json = fromBase64Url(encoded);
    const parsed: unknown = JSON.parse(json);
    const result = ShareDataSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

/**
 * URL ハッシュ文字列全体から共有データを復元する(`getShareHashParam` +
 * `decodeShareValue` の合成)。ハッシュにパラメータが無い・不正な場合は `null`。
 */
export function decodeShareHash(hash: string): ShareData | null {
  const raw = getShareHashParam(hash);
  return raw === null ? null : decodeShareValue(raw);
}
