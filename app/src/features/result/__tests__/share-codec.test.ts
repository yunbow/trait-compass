import { describe, expect, it } from "vitest";

import {
  ShareDataSchema,
  buildShareHash,
  decodeShareHash,
  decodeShareValue,
  encodeShareData,
  getShareHashParam,
  toShareData,
} from "@/features/result/services/share-codec";
import type { ShareData } from "@/features/result/services/share-codec";

const FULL_SHARE_DATA: ShareData = {
  categoryScores: {
    communication: 80,
    "social-reading": 60,
    "emotion-regulation": 40,
    "impulse-memory": 20,
    "executive-function": 0,
    "kindness-misread": 100,
    sensory: 50,
    motor: 10,
    learning: 30,
    "restricted-repetitive": 70,
  },
  traitScores: { ASD: 70, ADHD: 40, LD: 10, DCD: 0 },
  grayZoneCount: 3,
  overlapCounts: { "ADHD+ASD": 2, "ASD+DCD+LD": 5 },
};

// null 混在パターン(回答0件のカテゴリ・特性がある状態)。
const PARTIAL_SHARE_DATA: ShareData = {
  categoryScores: {
    communication: 80,
    "social-reading": null,
    "emotion-regulation": null,
    "impulse-memory": 20,
    "executive-function": null,
    "kindness-misread": null,
    sensory: null,
    motor: null,
    learning: null,
    "restricted-repetitive": null,
  },
  traitScores: { ASD: null, ADHD: null, LD: null, DCD: null },
  grayZoneCount: 0,
  overlapCounts: {},
};

describe("encodeShareData / decodeShareValue: roundtrip", () => {
  it("全カテゴリ・全特性が算出済みのデータを往復変換できる", () => {
    const encoded = encodeShareData(FULL_SHARE_DATA);
    expect(encoded.startsWith("v1.")).toBe(true);

    const decoded = decodeShareValue(encoded);
    expect(decoded).toEqual(FULL_SHARE_DATA);
  });

  it("null(未算出)を含むカテゴリ・特性スコアも往復変換できる", () => {
    const encoded = encodeShareData(PARTIAL_SHARE_DATA);
    const decoded = decodeShareValue(encoded);
    expect(decoded).toEqual(PARTIAL_SHARE_DATA);
  });

  it("重なり件数が空(overlapCounts: {})でも往復変換できる", () => {
    const encoded = encodeShareData(PARTIAL_SHARE_DATA);
    const decoded = decodeShareValue(encoded);
    expect(decoded?.overlapCounts).toEqual({});
  });
});

describe("buildShareHash / decodeShareHash", () => {
  it("`#r=v1...` 形式のハッシュを組み立てられる", () => {
    const hash = buildShareHash(FULL_SHARE_DATA);
    expect(hash.startsWith("#r=v1.")).toBe(true);
  });

  it("組み立てたハッシュ文字列から共有データを復元できる", () => {
    const hash = buildShareHash(FULL_SHARE_DATA);
    const decoded = decodeShareHash(hash);
    expect(decoded).toEqual(FULL_SHARE_DATA);
  });

  it("`#` を含まない生のクエリ文字列でも復元できる", () => {
    const hash = buildShareHash(FULL_SHARE_DATA);
    const decoded = decodeShareHash(hash.slice(1));
    expect(decoded).toEqual(FULL_SHARE_DATA);
  });
});

describe("getShareHashParam", () => {
  it("r パラメータが存在する場合はその生値を返す", () => {
    const hash = buildShareHash(FULL_SHARE_DATA);
    expect(getShareHashParam(hash)).toBe(hash.slice("#r=".length));
  });

  it("r パラメータが存在しない場合は null を返す", () => {
    expect(getShareHashParam("")).toBeNull();
    expect(getShareHashParam("#")).toBeNull();
    expect(getShareHashParam("#foo=bar")).toBeNull();
  });
});

describe("不正な入力の拒否(AC-8)", () => {
  it("バージョンプレフィックスが無い文字列は null を返す", () => {
    expect(decodeShareValue("not-a-valid-value")).toBeNull();
  });

  it("バージョンが異なる(将来の v2 等)文字列は null を返す", () => {
    expect(decodeShareValue("v2.abcdef")).toBeNull();
  });

  it("base64url として不正な文字を含む場合は例外を投げずに null を返す", () => {
    expect(decodeShareValue("v1.not base64!!")).toBeNull();
  });

  it("base64url としては正しいが JSON として壊れている場合は null を返す", () => {
    // "not json" を base64url エンコードしたもの(手動で構築)。
    const brokenJsonBase64Url = Buffer.from("not json", "utf-8").toString("base64url");
    expect(decodeShareValue(`v1.${brokenJsonBase64Url}`)).toBeNull();
  });

  it("JSON としては正しいがスキーマに合わない(自由記述フィールドが混入している等)場合は null を返す", () => {
    const invalidPayload = {
      ...FULL_SHARE_DATA,
      freeText: "混入させようとした自由記述",
    };
    const json = JSON.stringify(invalidPayload);
    const base64url = Buffer.from(json, "utf-8").toString("base64url");
    expect(decodeShareValue(`v1.${base64url}`)).toBeNull();
  });

  it("カテゴリスコアが欠けている場合は null を返す", () => {
    const invalidPayload = {
      categoryScores: { communication: 80 },
      traitScores: FULL_SHARE_DATA.traitScores,
      grayZoneCount: 0,
      overlapCounts: {},
    };
    const json = JSON.stringify(invalidPayload);
    const base64url = Buffer.from(json, "utf-8").toString("base64url");
    expect(decodeShareValue(`v1.${base64url}`)).toBeNull();
  });

  it("空文字列を渡しても例外を投げずに null を返す", () => {
    expect(decodeShareValue("")).toBeNull();
    expect(decodeShareHash("")).toBeNull();
  });
});

describe("ShareDataSchema: 自由記述・地域情報を含まないことの保証(AC-3)", () => {
  it("スキーマのトップレベルフィールドは categoryScores/traitScores/grayZoneCount/overlapCounts の4つのみ", () => {
    expect(Object.keys(ShareDataSchema.shape).sort()).toEqual(
      ["categoryScores", "grayZoneCount", "overlapCounts", "traitScores"].sort(),
    );
  });

  it("自由記述(freeText)や地域(region/prefecture/city 等)のフィールドを追加した値は strict 検証で拒否される", () => {
    const withFreeText = { ...FULL_SHARE_DATA, freeText: "個人的な感想" };
    expect(ShareDataSchema.safeParse(withFreeText).success).toBe(false);

    const withRegion = { ...FULL_SHARE_DATA, region: "東京都", city: "渋谷区" };
    expect(ShareDataSchema.safeParse(withRegion).success).toBe(false);
  });

  it("回答の生値(answers/questionId 等)を追加した値も strict 検証で拒否される", () => {
    const withRawAnswers = {
      ...FULL_SHARE_DATA,
      answers: [{ questionId: "ND-0001", value: 2 }],
    };
    expect(ShareDataSchema.safeParse(withRawAnswers).success).toBe(false);
  });
});

describe("toShareData", () => {
  it("scoreSurvey 相当の結果から、共有対象4フィールドのみを取り出す(traitScores は常に null で埋める)", () => {
    const result = toShareData({
      categoryScores: FULL_SHARE_DATA.categoryScores,
      traitScores: FULL_SHARE_DATA.traitScores,
      grayZoneMeta: { grayZoneCount: FULL_SHARE_DATA.grayZoneCount },
      overlapCounts: FULL_SHARE_DATA.overlapCounts,
    });

    expect(result).toEqual({ ...FULL_SHARE_DATA, traitScores: { ASD: null, ADHD: null, LD: null, DCD: null } });
    expect(Object.keys(result).sort()).toEqual(
      ["categoryScores", "grayZoneCount", "overlapCounts", "traitScores"].sort(),
    );
  });

  it("実際の特性別スコアが非null(算出済み)であっても、traitScores は常に全件 null として返す", () => {
    const result = toShareData({
      categoryScores: FULL_SHARE_DATA.categoryScores,
      traitScores: { ASD: 70, ADHD: 40, LD: 10, DCD: 0 },
      grayZoneMeta: { grayZoneCount: FULL_SHARE_DATA.grayZoneCount },
      overlapCounts: FULL_SHARE_DATA.overlapCounts,
    });

    expect(result.traitScores).toEqual({ ASD: null, ADHD: null, LD: null, DCD: null });
  });
});
