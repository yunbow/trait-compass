"use client";
import { useMemo } from "react";
import type { KeyboardEvent } from "react";
import { MapPopupCard } from "@/features/support/components/MapPopupCard";
import { FacilityCard } from "@/features/support/components/FacilityCard";
import type { MapPin } from "@/features/support/components/MapView";
import { buildTileUrl, computeViewportOrigin, latLngToViewportPixel, TILE_SIZE } from "@/features/support/services/map-tiles";
import type { LatLngLike } from "@/features/support/services/distance";

const ZOOM = 13;
const SIZE = 3 * TILE_SIZE;
const PIN_PATH = "M12 2C8.13 2 5 5.13 5 9C5 14.25 12 22 12 22C12 22 19 14.25 19 9C19 5.13 15.87 2 12 2M12 11.5C10.62 11.5 9.5 10.38 9.5 9C9.5 7.62 10.62 6.5 12 6.5C13.38 6.5 14.5 7.62 14.5 9C14.5 10.38 13.38 11.5 12 11.5Z";
const CURRENT_LOCATION_COLOR = "#2563eb";
interface Props { center: { lat: number; lng: number }; centerLabel: string; pins: MapPin[]; selectedPin: MapPin | null; onPinSelect: (pin: MapPin) => void; onShowDetails: (id: string) => void; popupVariant: "compact" | "full"; currentLocation?: LatLngLike | null }

export function GsiMapView({ center, centerLabel, pins, selectedPin, onPinSelect, onShowDetails, popupVariant, currentLocation = null }: Props) {
  const { tiles, positions, centerPosition, currentPosition } = useMemo(() => {
    const origin = computeViewportOrigin(center, ZOOM, SIZE);
    const ox = Math.floor(origin.x / TILE_SIZE), oy = Math.floor(origin.y / TILE_SIZE);
    const tiles: { key: string; url: string; left: number; top: number }[] = [];
    for (let dx = 0; dx <= 3; dx++) for (let dy = 0; dy <= 3; dy++) {
      const x = ox + dx, y = oy + dy;
      tiles.push({ key: `${x}-${y}`, url: buildTileUrl(ZOOM, x, y), left: x * TILE_SIZE - origin.x, top: y * TILE_SIZE - origin.y });
    }
    return { tiles, positions: pins.map((pin) => ({ pin, point: latLngToViewportPixel(pin.lat, pin.lng, ZOOM, origin) })), centerPosition: latLngToViewportPixel(center.lat, center.lng, ZOOM, origin), currentPosition: currentLocation ? latLngToViewportPixel(currentLocation.lat, currentLocation.lng, ZOOM, origin) : null };
  }, [center, pins, currentLocation]);
  function onKey(event: KeyboardEvent<SVGGElement>, pin: MapPin) { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onPinSelect(pin); } }
  const selectedPoint = selectedPin ? positions.find(({ pin }) => pin.id === selectedPin.id)?.point : undefined;
  const popupWidth = popupVariant === "full" ? 320 : 280;
  const popupHeight = popupVariant === "full" ? 400 : 142;
  const popupX = selectedPoint ? Math.max(8, Math.min(selectedPoint.x - popupWidth / 2, SIZE - popupWidth - 8)) : 0;
  const popupY = selectedPoint ? Math.max(8, selectedPoint.y - popupHeight - 8) : 0;
  return (
    <svg className="size-full bg-muted" viewBox={`0 0 ${SIZE} ${SIZE}`} preserveAspectRatio="xMidYMid slice" role="group" aria-label={`${centerLabel}を中心とした地図`}>
      {tiles.map((tile) => <image key={tile.key} href={tile.url} x={tile.left} y={tile.top} width={TILE_SIZE} height={TILE_SIZE} />)}
      <circle cx={centerPosition.x} cy={centerPosition.y} r={6} className="fill-foreground/70 stroke-background" strokeWidth={2} />
      {currentPosition && <g role="img" aria-label="現在地"><title>現在地</title><circle cx={currentPosition.x} cy={currentPosition.y} r={10} fill={CURRENT_LOCATION_COLOR} opacity={0.25} /><circle cx={currentPosition.x} cy={currentPosition.y} r={5} fill={CURRENT_LOCATION_COLOR} className="stroke-background" strokeWidth={2} /></g>}
      {positions.map(({ pin, point }) => <g key={pin.id} tabIndex={0} role="button" aria-label={`${pin.name}の施設情報を表示`} onClick={() => onPinSelect(pin)} onKeyDown={(e) => onKey(e, pin)} className="cursor-pointer outline-none focus-visible:opacity-70" transform={`translate(${point.x - 12},${point.y - 22})`}><title>{pin.name}</title><path d={PIN_PATH} className="fill-destructive stroke-background" strokeWidth={1.5} /></g>)}
      {selectedPin && selectedPoint && <foreignObject x={popupX} y={popupY} width={popupWidth} height={popupHeight}><div className={`h-full rounded-lg border border-border bg-white shadow-lg dark:bg-popover ${popupVariant === "full" ? "overflow-y-auto" : "p-3"}`}>{popupVariant === "full" ? selectedPin.fullPopup ?? (selectedPin.facility && <FacilityCard facility={selectedPin.facility} selectedMunicipality={centerLabel} />) : <MapPopupCard pin={selectedPin} onShowDetails={() => onShowDetails(selectedPin.id)} />}</div></foreignObject>}
    </svg>
  );
}
