// 想定ルート(SupportPathway)のステップ順序を施設一覧の表示順へ反映させる純関数(TICKET-未採番)。
//
// D1 アクセスを含まないため、page.tsx の loadResultsData から呼び出すだけで完結する
// (fetchSupportPathway・searchFacilities の結果を組み合わせるだけの後処理ステップ)。

import type { SupportPathwayStepData } from "@/features/support/services/support-pathway";

/**
 * 想定ルート(SupportPathway)のステップに登場する窓口名(actor)をもとに、施設一覧の
 * isPathwayFacility フラグを設定し、その窓口名の出現順(重複するactorは初出のみ採用)で
 * 施設を先頭へ並べ替える純関数。
 *
 * - actorに一致しない施設は isPathwayFacility=false のまま、元の相対順序を維持して後方に続く
 *   (安定ソート)。
 * - pathwaySteps が空、または name に一致する施設が1件も無い場合は、isPathwayFacility を
 *   すべて false にしたコピーをそのまま返す(順序は変えない)。
 */
export function applyPathwayPriority<T extends { name: string; isPathwayFacility: boolean }>(
  rows: readonly T[],
  pathwaySteps: readonly Pick<SupportPathwayStepData, "actor">[],
): T[] {
  // actor から null を除外し、出現順で重複除去した「優先窓口名リスト」を作る。
  const priorityNames: string[] = [];
  const seenNames = new Set<string>();
  for (const step of pathwaySteps) {
    if (step.actor === null) continue;
    if (seenNames.has(step.actor)) continue;
    seenNames.add(step.actor);
    priorityNames.push(step.actor);
  }

  // 優先窓口名が1件も無ければ、isPathwayFacility を全件 false にしたコピーを順序そのまま返す。
  if (priorityNames.length === 0) {
    return rows.map((row) => ({ ...row, isPathwayFacility: false }));
  }

  // name → 該当施設一覧(rows 内での元の相対順序を維持するため、出現順に push する)。
  const rowsByName = new Map<string, T[]>();
  const others: T[] = [];
  for (const row of rows) {
    if (seenNames.has(row.name)) {
      const existing = rowsByName.get(row.name);
      if (existing) {
        existing.push(row);
      } else {
        rowsByName.set(row.name, [row]);
      }
    } else {
      others.push({ ...row, isPathwayFacility: false });
    }
  }

  // 優先窓口名リストの順に、該当施設(同名複数あれば元の相対順序のまま)を並べる。
  const prioritized: T[] = [];
  for (const name of priorityNames) {
    const matched = rowsByName.get(name);
    if (!matched) continue;
    for (const row of matched) {
      prioritized.push({ ...row, isPathwayFacility: true });
    }
  }

  return [...prioritized, ...others];
}
