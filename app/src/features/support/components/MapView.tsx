"use client";
import { useState } from "react";
import { FullscreenToggleButton } from "@/features/support/components/FullscreenToggleButton";
import { GoogleMapView } from "@/features/support/components/GoogleMapView";
import { GsiMapView } from "@/features/support/components/GsiMapView";
import { useFullscreen } from "@/features/support/hooks/use-fullscreen";
import { cn } from "@/lib/utils";
import type { LatLngLike } from "@/features/support/services/distance";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";

export interface MapPin { id: string; name: string; lat: number; lng: number; address?: string | null; phone?: string | null; facility?: FacilityDisplayData; fullPopup?: React.ReactNode }
interface Props { center: { lat: number; lng: number }; centerLabel: string; pins: MapPin[]; onPinSelect?: (id: string) => void; popupVariant?: "compact" | "full"; layout?: "sidebar" | "full"; cardDomIdPrefix?: string; currentLocation?: LatLngLike | null }
function scrollToCard(id: string, prefix: string) { const el = document.getElementById(`${prefix}-${id}`); if (el) { el.scrollIntoView({ behavior: "smooth", block: "center" }); el.focus({ preventScroll: true }); } }

/**
 * MapView は「一覧と地図」「地図のみ」モードでのみ描画される(「一覧のみ」モードは地図自体を
 * マウントしない)。フルスクリーン拡大トグルをここに置くだけで、自然にその2モード限定になる。
 */
export function MapView({ center, centerLabel, pins, onPinSelect, popupVariant = "compact", layout = "sidebar", cardDomIdPrefix = "facility-card", currentLocation = null }: Props) {
  const provider = process.env.NEXT_PUBLIC_MAP_PROVIDER === "gsi" ? "gsi" : "google";
  const [selectedPin, setSelectedPin] = useState<MapPin | null>(null);
  const { fullscreen, setFullscreen, toggle } = useFullscreen();
  function showDetails(id: string) { setFullscreen(false); onPinSelect?.(id); scrollToCard(id, cardDomIdPrefix); }
  const common = { center, centerLabel, pins, selectedPin, onPinSelect: setSelectedPin, onShowDetails: showDetails, popupVariant, currentLocation };
  return (
    <div
      role={fullscreen ? "dialog" : undefined}
      aria-modal={fullscreen || undefined}
      aria-label={fullscreen ? `${centerLabel}の施設地図` : undefined}
      className={cn("flex flex-col gap-2", fullscreen && "fixed inset-0 z-50 bg-background p-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-[max(0.75rem,env(safe-area-inset-bottom))]")}
    >
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">{provider === "google" ? "Google Maps" : "国土地理院"}</p>
        <FullscreenToggleButton fullscreen={fullscreen} onToggle={toggle} expandLabel="地図を拡大" />
      </div>
      <div className={cn("overflow-hidden rounded-lg border border-border", fullscreen ? "min-h-0 flex-1" : layout === "full" ? "h-[70dvh] min-h-[420px]" : "h-64 lg:h-96")}>
        {provider === "gsi" ? <GsiMapView {...common} /> : <GoogleMapView {...common} onClosePopup={() => setSelectedPin(null)} />}
      </div>
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground"><span><span aria-hidden="true" className="text-destructive">●</span> 施設</span><span>● {centerLabel}の中心</span>{currentLocation && <span><span aria-hidden="true" style={{ color: "#2563eb" }}>●</span> 現在地</span>}</div>
      {provider === "gsi" && <p className="text-xs text-muted-foreground">地図: <a href="https://maps.gsi.go.jp/development/ichiran.html" target="_blank" rel="noopener noreferrer" className="underline">地理院タイル</a>(国土地理院)</p>}
    </div>
  );
}
