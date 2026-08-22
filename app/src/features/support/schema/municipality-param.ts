import { z } from "zod";

import {
  MUNICIPALITY_CODE_REGEX,
  isSupportedMunicipalityCode,
  resolveMunicipality,
} from "@/features/support/constants/municipality-registry";
import type { MunicipalityRegistryEntry } from "@/features/support/constants/municipality-registry";

/** コードの閉集合検証(コードのみ受理)。出力: string(5桁コード) */
export const MunicipalityCodeSchema = z.string().regex(MUNICIPALITY_CODE_REGEX).refine(isSupportedMunicipalityCode);

/** コードまたは旧名前を受理し、レジストリエントリへ解決する。出力: MunicipalityRegistryEntry */
export const MunicipalityEntrySchema = z.string().min(1).transform((value, ctx) => {
  const entry = resolveMunicipality(value);
  if (entry === null) {
    ctx.addIssue({ code: "custom", message: "unknown municipality" });
    return z.NEVER;
  }
  return entry;
});

/** searchParams 用ヘルパー。配列(重複クエリ)・undefined・不正値は null(現行の安全側方針を踏襲)。 */
export function parseMunicipalityParam(raw: string | string[] | undefined): MunicipalityRegistryEntry | null {
  if (typeof raw !== "string") return null;
  return resolveMunicipality(raw);
}
