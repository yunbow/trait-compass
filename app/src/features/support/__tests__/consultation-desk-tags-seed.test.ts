import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SUPPORT_TAGS } from "@/features/support/services/category-tag-mapping";

/**
 * facility_tags 手動シード(db/seed/consultation-desk-tags.sql・
 * db/seed/consultation-desk-tags-open-data.sql)に対する機械チェック。
 * db/schema.sql のコメント通り、投入するタグ値は SUPPORT_TAGS(TICKET-0013 で確定した6値)と
 * 完全一致していなければ検索側の突合(matchesSelectedTags)が成立しない。タイプミス等で
 * SUPPORT_TAGS に無い値を投入してしまう事故を防ぐため、SQL ファイルのテキストを直接検証する
 * (adult-benefit-cards-copy.test.ts と同じ方針)。
 *
 * 2026-08是正でファイルを分割した理由(consultation-desk-tags.sql 冒頭コメント参照):
 * オープンデータ取込(WAM NET・CKAN)由来のIDを参照する行は、それらの施設を投入していない
 * ローカルD1では外部キー制約違反になるため、常に成功する必要がある db:seed:local:manual /
 * db:reset:local からは分離した(consultation-desk-tags-open-data.sql、個別実行専用)。
 */

interface TagRow {
  facilityId: string;
  tag: string;
}

function readRows(fileName: string): TagRow[] {
  const rawSource = readFileSync(join(process.cwd(), "db", "seed", fileName), "utf8");
  const body = rawSource
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
  return [...body.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map(([, facilityId, tag]) => ({
    facilityId,
    tag,
  }));
}

function expectValidTagSeed(rows: TagRow[]): void {
  it("1件以上のタグ行を投入している", () => {
    expect(rows.length).toBeGreaterThan(0);
  });

  it("投入する全タグが SUPPORT_TAGS(TICKET-0013 で確定した6値)のみで構成される", () => {
    const invalidTags = rows.map((row) => row.tag).filter((tag) => !(SUPPORT_TAGS as readonly string[]).includes(tag));
    expect(invalidTags).toEqual([]);
  });

  it("同一施設・同一タグの重複行が無い(facility_tags の主キー制約と一致)", () => {
    const keys = rows.map((row) => `${row.facilityId}::${row.tag}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
}

describe("consultation-desk-tags.sql の facility_tags 手動シード(db:seed:local:manual に含まれる、固定ID分)", () => {
  const rows = readRows("consultation-desk-tags.sql");
  expectValidTagSeed(rows);

  it("対象はしんじゅく・せたがや若者サポートステーションの2施設に限定している(オープンデータ由来分は consultation-desk-tags-open-data.sql に分離)", () => {
    const distinctFacilityIds = new Set(rows.map((row) => row.facilityId));
    expect(distinctFacilityIds).toEqual(new Set(["fac-manual-saposute-shinjuku", "fac-manual-saposute-setagaya"]));
  });

  it("INSERT OR IGNORE を使っている(再実行時にエラーにならないこと)", () => {
    const rawSource = readFileSync(join(process.cwd(), "db", "seed", "consultation-desk-tags.sql"), "utf8");
    expect(rawSource).toContain("INSERT OR IGNORE INTO facility_tags");
  });
});

describe("consultation-desk-tags-open-data.sql の facility_tags 手動シード(個別実行専用、オープンデータ由来ID分)", () => {
  const rows = readRows("consultation-desk-tags-open-data.sql");
  expectValidTagSeed(rows);

  it("対象は根拠(名称・説明文)が明確な7施設(WAM NET由来6件+CKAN由来1件)に限定している", () => {
    const distinctFacilityIds = new Set(rows.map((row) => row.facilityId));
    expect(distinctFacilityIds.size).toBe(7);
  });

  it("INSERT OR IGNORE を使っている(再実行時にエラーにならないこと)", () => {
    const rawSource = readFileSync(join(process.cwd(), "db", "seed", "consultation-desk-tags-open-data.sql"), "utf8");
    expect(rawSource).toContain("INSERT OR IGNORE INTO facility_tags");
  });
});
