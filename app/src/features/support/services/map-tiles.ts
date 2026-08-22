export const GSI_TILE_URL_TEMPLATE = "https://cyberjapandata.gsi.go.jp/xyz/std/{z}/{x}/{y}.png";
export const TILE_SIZE = 256;
export interface PixelXY { x: number; y: number }
export function lonToTileX(lon: number, zoom: number) { return ((lon + 180) / 360) * 2 ** zoom; }
export function latToTileY(lat: number, zoom: number) {
  const rad = (lat * Math.PI) / 180;
  return ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * 2 ** zoom;
}
export function latLngToGlobalPixel(lat: number, lng: number, zoom: number): PixelXY {
  return { x: lonToTileX(lng, zoom) * TILE_SIZE, y: latToTileY(lat, zoom) * TILE_SIZE };
}
export function computeViewportOrigin(center: { lat: number; lng: number }, zoom: number, size: number): PixelXY {
  const pixel = latLngToGlobalPixel(center.lat, center.lng, zoom);
  return { x: pixel.x - size / 2, y: pixel.y - size / 2 };
}
export function latLngToViewportPixel(lat: number, lng: number, zoom: number, origin: PixelXY): PixelXY {
  const pixel = latLngToGlobalPixel(lat, lng, zoom);
  return { x: pixel.x - origin.x, y: pixel.y - origin.y };
}
export function buildTileUrl(zoom: number, x: number, y: number) {
  return GSI_TILE_URL_TEMPLATE.replace("{z}", String(zoom)).replace("{x}", String(x)).replace("{y}", String(y));
}
