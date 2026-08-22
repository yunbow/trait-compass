// 東京都の区市町村データは municipality-registry.ts に移行済み。このモジュールは既存利用者向けの互換レイヤー。

import { TOKYO_MUNICIPALITY_REGISTRY } from "./municipality-registry";

/** @deprecated 新規コードは municipality-registry.ts を参照してください。 */
export type Municipality = (typeof TOKYO_MUNICIPALITY_REGISTRY)[number]["name"];

/** @deprecated 新規コードは municipality-registry.ts を参照してください。 */
export const MUNICIPALITIES: readonly Municipality[] = TOKYO_MUNICIPALITY_REGISTRY.map((entry) => entry.name);
