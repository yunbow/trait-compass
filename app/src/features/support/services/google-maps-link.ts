// 施設カード等の「地図で探す」リンク生成(純関数)。
//
// 住所テキストをそのまま Google Maps の検索クエリに渡すと、建物名・部屋番号(「ランドール浅草102」等)が
// 含まれる場合にジオコーディングへ失敗し、ピンが立たないことがある(実例: 相談支援センターつなぐ、
// 「東京都台東区浅草３−９−２　ランドール浅草１０２」)。緯度経度が分かっている場合はそちらを優先し、
// 無い場合のみ住所・フォールバック文言(自治体名+施設名等)へ順に fall back する。

export interface GoogleMapsSearchTarget {
  lat: number | null;
  lng: number | null;
  address: string | null;
  /** lat/lng・address のいずれも無い場合に使う検索語(例: 自治体名+施設名)。 */
  fallbackQuery: string;
}

export function buildGoogleMapsSearchHref({ lat, lng, address, fallbackQuery }: GoogleMapsSearchTarget): string {
  const query = lat !== null && lng !== null ? `${lat},${lng}` : (address ?? fallbackQuery);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}
