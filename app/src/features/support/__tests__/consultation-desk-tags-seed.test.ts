import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { SUPPORT_TAGS } from "@/features/support/services/category-tag-mapping";

/**
 * facility_tags 手動シード(db/seed/consultation-desk-tags.sql)に対する機械チェック。
 * db/schema.sql のコメント通り、投入するタグ値は SUPPORT_TAGS(TICKET-0013 で確定した6値)と
 * 完全一致していなければ検索側の突合(matchesSelectedTags)が成立しない。タイプミス等で
 * SUPPORT_TAGS に無い値を投入してしまう事故を防ぐため、SQL ファイルのテキストを直接検証する
 * (adult-benefit-cards-copy.test.ts と同じ方針)。
 */

const SEED_FILE_PATH = join(process.cwd(), "db", "seed", "consultation-desk-tags.sql");

function stripSqlComments(source: string): string {
  return source
    .split("\n")
    .filter((line) => !line.trim().startsWith("--"))
    .join("\n");
}

describe("consultation-desk-tags.sql の facility_tags 手動シード", () => {
  const rawSource = readFileSync(SEED_FILE_PATH, "utf8");
  const body = stripSqlComments(rawSource);
  const rows = [...body.matchAll(/\(\s*'([^']+)'\s*,\s*'([^']+)'\s*\)/g)].map(([, facilityId, tag]) => ({
    facilityId,
    tag,
  }));

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

  it("対象は根拠(名称・説明文)が明確な9施設に限定している(残り65件は未タグのままにする方針、AC。都立精神保健福祉センター3施設は2026-08-11にno-diagnosis-facilities.sqlから削除済みのため12から減少)", () => {
    const distinctFacilityIds = new Set(rows.map((row) => row.facilityId));
    expect(distinctFacilityIds.size).toBe(9);
  });
});
