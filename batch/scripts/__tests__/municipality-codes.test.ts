import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import YAML from "yaml";

import {
  BROAD_AREA_MUNICIPALITY_CODE as MIRROR_BROAD_AREA_MUNICIPALITY_CODE,
  TOKYO_MUNICIPALITY_CODE_BY_NAME as MIRROR_TOKYO_MUNICIPALITY_CODE_BY_NAME,
} from "../municipality-codes.mjs";
import {
  BROAD_AREA_MUNICIPALITY_CODE,
  TOKYO_MUNICIPALITY_CODE_BY_NAME,
} from "../../../app/src/features/support/constants/municipality-codes";
import { MUNICIPALITIES } from "../../../app/src/features/support/constants/municipalities";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");

describe("municipality-codes: TS正本 ⇔ .mjsミラーのパリティ", () => {
  it("62件が深い等価である", () => {
    expect(MIRROR_TOKYO_MUNICIPALITY_CODE_BY_NAME).toEqual(TOKYO_MUNICIPALITY_CODE_BY_NAME);
  });
  it("広域コード定数が一致する", () => {
    expect(MIRROR_BROAD_AREA_MUNICIPALITY_CODE).toBe(BROAD_AREA_MUNICIPALITY_CODE);
    expect(BROAD_AREA_MUNICIPALITY_CODE).toBe("13000");
  });
});

describe("municipality-codes: MUNICIPALITIES とのキー整合", () => {
  it("キー集合が MUNICIPALITIES(62件)と完全一致する", () => {
    expect(Object.keys(TOKYO_MUNICIPALITY_CODE_BY_NAME).sort()).toEqual([...MUNICIPALITIES].sort());
    expect(Object.keys(TOKYO_MUNICIPALITY_CODE_BY_NAME)).toHaveLength(62);
  });
});

describe("municipality-codes: コードの形式・一意性", () => {
  it("全コードが /^13\\d{3}$/ に一致する", () => {
    for (const code of Object.values(TOKYO_MUNICIPALITY_CODE_BY_NAME)) expect(code).toMatch(/^13\d{3}$/);
  });
  it("コードに重複が無い(62件全てユニーク)", () => {
    const codes = Object.values(TOKYO_MUNICIPALITY_CODE_BY_NAME);
    expect(new Set(codes).size).toBe(codes.length);
  });
});

describe("municipality-codes: マイグレーション0028のCASE文との整合", () => {
  it("0028のCASE文が正本62件+(東京都,13000)と一致する", () => {
    const migrationSql = readFileSync(join(projectRoot, "app", "db", "migrations", "0028-add-municipality-code.sql"), "utf8");
    const caseBlockMatch = migrationSql.match(/UPDATE facilities SET municipality_code = CASE municipality([\s\S]*?)ELSE municipality_code END/);
    expect(caseBlockMatch).not.toBeNull();
    const found: Record<string, string> = {};
    const pattern = /WHEN\s+'([^']+)'\s+THEN\s+'(\d{5})'/g;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(caseBlockMatch![1])) !== null) found[match[1]] = match[2];
    expect(found).toEqual({ ...TOKYO_MUNICIPALITY_CODE_BY_NAME, 東京都: BROAD_AREA_MUNICIPALITY_CODE });
  });
});

describe("municipality-codes: data/manual/municipalities/*.yaml との整合", () => {
  // data/manual/municipalities/*.yaml は非公開リポジトリのみに存在するため、無い環境では skip する。
  const yamlDir = join(projectRoot, "data", "manual", "municipalities");
  it.skipIf(!existsSync(yamlDir))("YAMLの municipalityCode が正本の値と一致する", () => {
    const files = readdirSync(yamlDir).filter((file) => file.endsWith(".yaml"));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const survey = YAML.parse(readFileSync(join(yamlDir, file), "utf8"), { maxAliasCount: 2000 }) as { municipalityCode: string; municipalityName: string };
      const expectedCode = survey.municipalityName === "東京都" ? BROAD_AREA_MUNICIPALITY_CODE : TOKYO_MUNICIPALITY_CODE_BY_NAME[survey.municipalityName as keyof typeof TOKYO_MUNICIPALITY_CODE_BY_NAME];
      expect(survey.municipalityCode).toBe(expectedCode);
    }
  });
});
