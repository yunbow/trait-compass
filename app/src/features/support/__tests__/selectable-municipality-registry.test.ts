import { existsSync, readdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  MUNICIPALITY_REGISTRY,
  SELECTABLE_MUNICIPALITY_REGISTRY,
} from "@/features/support/constants/municipality-registry";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");

describe("SELECTABLE_MUNICIPALITY_REGISTRY: data/manual/municipalities との整合", () => {
  // data/manual/municipalities/*.yaml(区市町村別の手動調査データ)は非公開リポジトリのみに
  // 存在する。公開リポジトリ(このディレクトリが無い環境)ではこのテストの前提が成立しない
  // ため、存在しない場合は skip する(available-municipality-codes.json 自体は生成済みの
  // まま公開対象に含まれ、他2件のテストは通常どおり実行される)。
  const yamlDir = join(projectRoot, "data", "manual", "municipalities");
  const hasManualData = existsSync(yamlDir);

  it.skipIf(!hasManualData)("生成物(available-municipality-codes.json)が data/manual/municipalities/*.yaml と一致する", () => {
    const codesFromYamlFiles = readdirSync(yamlDir)
      .filter((file) => file.endsWith(".yaml"))
      .map((file) => file.slice(0, 5))
      .sort();

    const codesFromRegistry = SELECTABLE_MUNICIPALITY_REGISTRY.map((entry) => entry.code).sort();

    expect(codesFromRegistry).toEqual(codesFromYamlFiles);
  });

  it("MUNICIPALITY_REGISTRY(62件)の部分集合であり、コードは一意", () => {
    const fullCodes = new Set(MUNICIPALITY_REGISTRY.map((entry) => entry.code));
    for (const entry of SELECTABLE_MUNICIPALITY_REGISTRY) {
      expect(fullCodes.has(entry.code)).toBe(true);
    }
    const selectableCodes = SELECTABLE_MUNICIPALITY_REGISTRY.map((entry) => entry.code);
    expect(new Set(selectableCodes).size).toBe(selectableCodes.length);
  });

  it("data/manual/municipalities/ にファイルの無い自治体(例: 三宅村 13381)は含まない", () => {
    expect(SELECTABLE_MUNICIPALITY_REGISTRY.some((entry) => entry.code === "13381")).toBe(false);
  });
});
