import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH, normalizeHtmlKnowledgeSections } from "../html-knowledge-normalize";
import type { HtmlKnowledgeSection } from "../html-knowledge-normalize";

// テスト用フィクスチャ(TICKET-0049、実データではない)。
// __tests__/fixtures/hattatsu-knowledge-sections.json を参照。
const FIXTURE_PATH = join(__dirname, "fixtures", "hattatsu-knowledge-sections.json");
const fixture = JSON.parse(readFileSync(FIXTURE_PATH, "utf8")) as { sections: HtmlKnowledgeSection[] };

describe("normalizeHtmlKnowledgeSections", () => {
  it("フィクスチャの全セクションを facility レコードへ正規化する", () => {
    const result = normalizeHtmlKnowledgeSections(fixture.sections, "ds-hattatsu-shien-center", "発達障害支援資料");

    expect(result).toHaveLength(fixture.sections.length);
    expect(result[0].name).toBe(fixture.sections[0].title);
    expect(result[0].description).toBe(fixture.sections[0].text);
    expect(result[0].url).toBe(fixture.sections[0].url);
    expect(result[0].categoryType).toBe("発達障害支援資料");
    expect(result[0].municipality).toBe("東京都");
    expect(result[0].ageRange).toBe("both");
    expect(result[0].isMedical).toBe(false);
    expect(result[0].isOutOfScope).toBe(false);
    expect(result[0].address).toBeNull();
    expect(result[0].phone).toBeNull();
    // migration 0016: HTML 知識源は区市町村に紐づかない広域窓口扱いのため、lifestage による
    // 細分は行わない(常に null、細分なし=従来どおり)。
    expect(result[0].lifestageMin).toBeNull();
    expect(result[0].lifestageMax).toBeNull();
  });

  it("同じ datasetId+url からは常に同じ id を生成する(決定的ID、再取込時のUPSERT安定性)", () => {
    const first = normalizeHtmlKnowledgeSections(fixture.sections, "ds-hattatsu-shien-center", "発達障害支援資料");
    const second = normalizeHtmlKnowledgeSections(fixture.sections, "ds-hattatsu-shien-center", "発達障害支援資料");
    expect(first[0].id).toBe(second[0].id);
  });

  it("datasetId が異なれば id も異なる", () => {
    const a = normalizeHtmlKnowledgeSections(fixture.sections, "ds-a", "発達障害支援資料");
    const b = normalizeHtmlKnowledgeSections(fixture.sections, "ds-b", "発達障害支援資料");
    expect(a[0].id).not.toBe(b[0].id);
  });

  it("title・text のいずれかが空のセクションは除外する", () => {
    const sections: HtmlKnowledgeSection[] = [
      { title: "", url: "https://example.com/a", text: "本文" },
      { title: "タイトル", url: "https://example.com/b", text: "" },
      { title: "有効なタイトル", url: "https://example.com/c", text: "有効な本文" },
    ];
    const result = normalizeHtmlKnowledgeSections(sections, "ds-x", "発達障害支援資料");
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("有効なタイトル");
  });

  it(`本文が${HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH}文字を超える場合は末尾を切り詰める`, () => {
    const longText = "あ".repeat(HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH + 100);
    const result = normalizeHtmlKnowledgeSections(
      [{ title: "長文セクション", url: "https://example.com/long", text: longText }],
      "ds-x",
      "発達障害支援資料",
    );
    expect(result[0].description?.length).toBe(HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH + 1);
    expect(result[0].description?.endsWith("…")).toBe(true);
  });

  it("rawJson に元のセクション情報を保持する(デバッグ・再取込確認用)", () => {
    const result = normalizeHtmlKnowledgeSections(fixture.sections, "ds-hattatsu-shien-center", "発達障害支援資料");
    expect(JSON.parse(result[0].rawJson)).toEqual(fixture.sections[0]);
  });
});
