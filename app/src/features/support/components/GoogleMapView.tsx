"use client";
import { AdvancedMarker, APIProvider, InfoWindow, Map, Pin } from "@vis.gl/react-google-maps";
import { MapPopupCard } from "@/features/support/components/MapPopupCard";
import { FacilityCard } from "@/features/support/components/FacilityCard";
import type { MapPin } from "@/features/support/components/MapView";
import type { LatLngLike } from "@/features/support/services/distance";

const CURRENT_LOCATION_COLOR = "#2563eb";

interface Props {
  center: { lat: number; lng: number }; centerLabel: string; pins: MapPin[]; selectedPin: MapPin | null;
  onPinSelect: (pin: MapPin) => void; onClosePopup: () => void; onShowDetails: (id: string) => void; popupVariant: "compact" | "full"; currentLocation?: LatLngLike | null;
}
export function GoogleMapView({ center, centerLabel, pins, selectedPin, onPinSelect, onClosePopup, onShowDetails, popupVariant, currentLocation = null }: Props) {
  const apiKey = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
  const mapId = process.env.NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID;
  if (!apiKey || !mapId) return <p className="p-4 text-sm text-muted-foreground">Google Mapsの設定が未完了です。</p>;
  return (
    <APIProvider apiKey={apiKey}>
      <Map mapId={mapId} defaultCenter={center} defaultZoom={13} gestureHandling="cooperative" mapTypeControl={false} streetViewControl={false} style={{ width: "100%", height: "100%" }}>
        <AdvancedMarker position={center} title={`${centerLabel}の中心`}><Pin background="var(--foreground)" scale={0.7} /></AdvancedMarker>
        {currentLocation && <AdvancedMarker position={currentLocation} title="現在地"><div aria-hidden="true" style={{ width: 16, height: 16, borderRadius: "50%", background: CURRENT_LOCATION_COLOR, border: "3px solid #fff", boxShadow: "0 0 0 2px rgba(37,99,235,0.35)" }} /></AdvancedMarker>}
        {pins.map((pin) => <AdvancedMarker key={pin.id} position={pin} title={pin.name} onClick={() => onPinSelect(pin)}><Pin background="var(--destructive)" /></AdvancedMarker>)}
        {selectedPin && <InfoWindow position={selectedPin} maxWidth={popupVariant === "full" ? 340 : undefined} onCloseClick={onClosePopup} headerContent={<span className="sr-only">施設情報</span>}>
          {popupVariant === "full" ? <div className="max-h-[360px] w-80 max-w-full overflow-y-auto">{selectedPin.fullPopup ?? (selectedPin.facility && <FacilityCard facility={selectedPin.facility} selectedMunicipality={centerLabel} />)}</div> : <MapPopupCard pin={selectedPin} onShowDetails={() => onShowDetails(selectedPin.id)} />}
        </InfoWindow>}
      </Map>
    </APIProvider>
  );
}
