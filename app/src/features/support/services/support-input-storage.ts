import { z } from "zod";

import { getMunicipalityByName, resolveMunicipality } from "@/features/support/constants/municipality-registry";
import type { Municipality } from "@/features/support/constants/municipalities";
import { LIFESTAGE_VALUES } from "@/features/support/services/lifestage-mapping";
import { readLocalJson, removeLocalItem, writeLocalJson } from "@/lib/storage/local-json-store";

/**
 * 「年齢と地域の保存」設定(supportInputMemoryEnabled)がONの場合のみ使う、/support の年齢(ライフステージ)・
 * 区市町村の選択の永続化(NFR-32「地域名の任意記憶はP1以降に明示同意UIと削除導線を設ける
 * 場合のみ検討」への対応)。`src/features/survey/services/progress.ts` と同じ実装パターン。
 */
export const SUPPORT_INPUT_STORAGE_KEY = "nd-support-input";

const StoredSupportInputSelectionSchema = z
  .object({
    lifestage: z.enum(LIFESTAGE_VALUES).nullable(),
    municipality: z.string().nullable(),
  })
  .strict();

export type SupportInputSelection = {
  lifestage: (typeof LIFESTAGE_VALUES)[number] | null;
  municipality: Municipality | null;
};

export function loadSupportInputSelection(): SupportInputSelection | null {
  const parsed = readLocalJson(SUPPORT_INPUT_STORAGE_KEY, StoredSupportInputSelectionSchema);
  if (parsed === null) return null;
  const municipality = parsed.municipality === null ? null : resolveMunicipality(parsed.municipality)?.name;
  if (municipality === undefined) return null;
  return { lifestage: parsed.lifestage, municipality: municipality as Municipality | null };
}

export function saveSupportInputSelection(selection: SupportInputSelection): void {
  const municipality = selection.municipality === null ? null : (getMunicipalityByName(selection.municipality)?.code ?? null);
  writeLocalJson(SUPPORT_INPUT_STORAGE_KEY, { lifestage: selection.lifestage, municipality });
}

export function clearSupportInputSelection(): void {
  removeLocalItem(SUPPORT_INPUT_STORAGE_KEY);
}
