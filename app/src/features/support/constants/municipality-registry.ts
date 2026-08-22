// この形式は総務省の全国地方公共団体コード一覧から機械生成可能。生成スクリプトは他県追加時
// (Phase 3)に導入する。東京都分は Phase 1 検証済みデータからの機械的な転記であり再調査不要。
// 座標は各区市町村の区役所・市役所・町村役場所在地(国土地理院地図・自治体公式サイト等の
// 公知情報)に基づく概算の代表点で、区市町村粒度の現在地プリフィル用である。施設単位の
// 正確な住所ジオコーディングの代替ではない。

import availableMunicipalityCodes from "@/data/available-municipality-codes.json";

export interface MunicipalityRegistryEntry {
  /** 全国地方公共団体コード(JIS X 0402)5桁。検査数字付き6桁ではない。例: "13112" */
  code: string;
  name: string;
  prefectureCode: string;
  prefectureName: string;
  lat: number;
  lng: number;
}

export const TOKYO_MUNICIPALITY_REGISTRY = [
  { code: "13101", name: "千代田区", prefectureCode: "13", prefectureName: "東京都", lat: 35.694, lng: 139.7536 },
  { code: "13102", name: "中央区", prefectureCode: "13", prefectureName: "東京都", lat: 35.6706, lng: 139.772 },
  { code: "13103", name: "港区", prefectureCode: "13", prefectureName: "東京都", lat: 35.6581, lng: 139.7514 },
  { code: "13104", name: "新宿区", prefectureCode: "13", prefectureName: "東京都", lat: 35.6938, lng: 139.7036 },
  { code: "13105", name: "文京区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7081, lng: 139.7523 },
  { code: "13106", name: "台東区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7126, lng: 139.78 },
  { code: "13107", name: "墨田区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7106, lng: 139.8016 },
  { code: "13108", name: "江東区", prefectureCode: "13", prefectureName: "東京都", lat: 35.6729, lng: 139.8172 },
  { code: "13109", name: "品川区", prefectureCode: "13", prefectureName: "東京都", lat: 35.6092, lng: 139.7301 },
  { code: "13110", name: "目黒区", prefectureCode: "13", prefectureName: "東京都", lat: 35.6414, lng: 139.6982 },
  { code: "13111", name: "大田区", prefectureCode: "13", prefectureName: "東京都", lat: 35.5614, lng: 139.7161 },
  { code: "13112", name: "世田谷区", prefectureCode: "13", prefectureName: "東京都", lat: 35.6467, lng: 139.6531 },
  { code: "13113", name: "渋谷区", prefectureCode: "13", prefectureName: "東京都", lat: 35.664, lng: 139.7005 },
  { code: "13114", name: "中野区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7076, lng: 139.6638 },
  { code: "13115", name: "杉並区", prefectureCode: "13", prefectureName: "東京都", lat: 35.6994, lng: 139.6364 },
  { code: "13116", name: "豊島区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7263, lng: 139.716 },
  { code: "13117", name: "北区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7526, lng: 139.7337 },
  { code: "13118", name: "荒川区", prefectureCode: "13", prefectureName: "東京都", lat: 35.736, lng: 139.7834 },
  { code: "13119", name: "板橋区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7511, lng: 139.7093 },
  { code: "13120", name: "練馬区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7357, lng: 139.6519 },
  { code: "13121", name: "足立区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7749, lng: 139.8045 },
  { code: "13122", name: "葛飾区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7434, lng: 139.8474 },
  { code: "13123", name: "江戸川区", prefectureCode: "13", prefectureName: "東京都", lat: 35.7069, lng: 139.8683 },
  { code: "13201", name: "八王子市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6559, lng: 139.3388 },
  { code: "13202", name: "立川市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6939, lng: 139.4133 },
  { code: "13203", name: "武蔵野市", prefectureCode: "13", prefectureName: "東京都", lat: 35.718, lng: 139.5665 },
  { code: "13204", name: "三鷹市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6835, lng: 139.5595 },
  { code: "13205", name: "青梅市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7876, lng: 139.2757 },
  { code: "13206", name: "府中市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6693, lng: 139.478 },
  { code: "13207", name: "昭島市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7061, lng: 139.3536 },
  { code: "13208", name: "調布市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6516, lng: 139.5427 },
  { code: "13209", name: "町田市", prefectureCode: "13", prefectureName: "東京都", lat: 35.546, lng: 139.438 },
  { code: "13210", name: "小金井市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6996, lng: 139.5052 },
  { code: "13211", name: "小平市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7288, lng: 139.4788 },
  { code: "13212", name: "日野市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6714, lng: 139.3958 },
  { code: "13213", name: "東村山市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7566, lng: 139.4696 },
  { code: "13214", name: "国分寺市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7027, lng: 139.4661 },
  { code: "13215", name: "国立市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6843, lng: 139.4413 },
  { code: "13218", name: "福生市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7368, lng: 139.3257 },
  { code: "13219", name: "狛江市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6355, lng: 139.5772 },
  { code: "13220", name: "東大和市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7488, lng: 139.4258 },
  { code: "13221", name: "清瀬市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7793, lng: 139.5225 },
  { code: "13222", name: "東久留米市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7561, lng: 139.5307 },
  { code: "13223", name: "武蔵村山市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7583, lng: 139.3937 },
  { code: "13224", name: "多摩市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6367, lng: 139.4463 },
  { code: "13225", name: "稲城市", prefectureCode: "13", prefectureName: "東京都", lat: 35.6377, lng: 139.5049 },
  { code: "13227", name: "羽村市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7686, lng: 139.3117 },
  { code: "13228", name: "あきる野市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7264, lng: 139.2937 },
  { code: "13229", name: "西東京市", prefectureCode: "13", prefectureName: "東京都", lat: 35.7255, lng: 139.5382 },
  { code: "13303", name: "瑞穂町", prefectureCode: "13", prefectureName: "東京都", lat: 35.758, lng: 139.3436 },
  { code: "13305", name: "日の出町", prefectureCode: "13", prefectureName: "東京都", lat: 35.742, lng: 139.2481 },
  { code: "13307", name: "檜原村", prefectureCode: "13", prefectureName: "東京都", lat: 35.728, lng: 139.15 },
  { code: "13308", name: "奥多摩町", prefectureCode: "13", prefectureName: "東京都", lat: 35.809, lng: 139.1005 },
  { code: "13361", name: "大島町", prefectureCode: "13", prefectureName: "東京都", lat: 34.75, lng: 139.36 },
  { code: "13362", name: "利島村", prefectureCode: "13", prefectureName: "東京都", lat: 34.5167, lng: 139.2833 },
  { code: "13363", name: "新島村", prefectureCode: "13", prefectureName: "東京都", lat: 34.3667, lng: 139.2667 },
  { code: "13364", name: "神津島村", prefectureCode: "13", prefectureName: "東京都", lat: 34.2, lng: 139.1333 },
  { code: "13381", name: "三宅村", prefectureCode: "13", prefectureName: "東京都", lat: 34.0833, lng: 139.5333 },
  { code: "13382", name: "御蔵島村", prefectureCode: "13", prefectureName: "東京都", lat: 33.8833, lng: 139.6 },
  { code: "13401", name: "八丈町", prefectureCode: "13", prefectureName: "東京都", lat: 33.113, lng: 139.786 },
  { code: "13402", name: "青ヶ島村", prefectureCode: "13", prefectureName: "東京都", lat: 32.467, lng: 139.76 },
  { code: "13421", name: "小笠原村", prefectureCode: "13", prefectureName: "東京都", lat: 27.094, lng: 142.193 },
] as const satisfies readonly MunicipalityRegistryEntry[];

/** 全都道府県の集約ビュー。Phase 3 で他県配列を spread 追加する拡張点。 */
export const MUNICIPALITY_REGISTRY: readonly MunicipalityRegistryEntry[] = [...TOKYO_MUNICIPALITY_REGISTRY];

const availableMunicipalityCodeSet = new Set<string>(availableMunicipalityCodes);

/**
 * data/manual/municipalities/ に実データファイルがある自治体のみ(生成元:
 * scripts/generate-available-municipalities.mjs)。URL パラメータ検証など「自治体として
 * 有効かどうか」の判定には引き続き MUNICIPALITY_REGISTRY(62件全て)を使い、こちらは
 * MunicipalityCombobox のようにユーザーに選ばせる候補を絞りたい箇所でのみ使う。
 */
export const SELECTABLE_MUNICIPALITY_REGISTRY: readonly MunicipalityRegistryEntry[] =
  MUNICIPALITY_REGISTRY.filter((entry) => availableMunicipalityCodeSet.has(entry.code));

export const MUNICIPALITY_CODE_REGEX = /^\d{5}$/;

const municipalityByCode = new Map(MUNICIPALITY_REGISTRY.map((entry) => [entry.code, entry]));
const municipalitiesByName = new Map<string, MunicipalityRegistryEntry[]>();
for (const entry of MUNICIPALITY_REGISTRY) {
  const entries = municipalitiesByName.get(entry.name) ?? [];
  entries.push(entry);
  municipalitiesByName.set(entry.name, entries);
}

export function getMunicipalityByCode(code: string): MunicipalityRegistryEntry | null {
  return municipalityByCode.get(code) ?? null;
}

/** 同名自治体が複数一致する場合は曖昧回避のため null を返す(現時点では東京都のみなので常に一意)。 */
export function getMunicipalityByName(name: string): MunicipalityRegistryEntry | null {
  const entries = municipalitiesByName.get(name);
  return entries?.length === 1 ? entries[0] : null;
}

export function isSupportedMunicipalityCode(code: string): boolean {
  return municipalityByCode.has(code);
}

/** コード優先で解決: MUNICIPALITY_CODE_REGEX にマッチすればコード検索、そうでなければ名前検索。どちらも不一致なら null。 */
export function resolveMunicipality(value: string): MunicipalityRegistryEntry | null {
  return MUNICIPALITY_CODE_REGEX.test(value) ? getMunicipalityByCode(value) : getMunicipalityByName(value);
}
