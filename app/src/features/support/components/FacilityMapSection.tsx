import { MapView } from "@/features/support/components/MapView";
import type { MapPin } from "@/features/support/components/MapView";
import { MUNICIPALITY_CENTERS } from "@/features/support/constants/municipality-centers";
import type { Municipality } from "@/features/support/constants/municipalities";
import { sortByDistanceFromCenter } from "@/features/support/services/distance";
import type { LatLngLike } from "@/features/support/services/distance";
import type { FacilityDisplayData } from "@/features/support/services/facility-display";

interface FacilityMapSectionProps {
  /** 支援情報案内画面で選択された区市町村(常に MUNICIPALITY_CENTERS のキーの1つ、FR-022)。 */
  municipality: Municipality;
  /** 現在のタブに表示中の施設一覧(FacilityResultsView から渡される整形済みデータ)。 */
  facilities: FacilityDisplayData[];
  layout: "sidebar" | "full";
  popupVariant: "compact" | "full";
  currentLocation?: LatLngLike | null;
}

/**
 * 地図表示セクション(FR-02A、TICKET-0028)。
 *
 * 地図に表示するのは lat/lng を持つ施設のみ
 * (未ジオコーディング・住所無しの施設は一覧のみで案内、AC の方針どおり)。
 * ピンの並び順(=一覧としては変えず、地図内部のソートのみ)は「区市町村中心からの直線距離」
 * (`sortByDistanceFromCenter`、NFR-33: 区市町村粒度までで現在地取得は行わない)。
 */
export function FacilityMapSection({ municipality, facilities, layout, popupVariant, currentLocation = null }: FacilityMapSectionProps) {
  const center = MUNICIPALITY_CENTERS[municipality];

  const withCoords = facilities.filter(
    (facility): facility is FacilityDisplayData & { lat: number; lng: number } =>
      facility.lat !== null && facility.lng !== null,
  );
  const missingCount = facilities.length - withCoords.length;
  const sorted = sortByDistanceFromCenter(withCoords, center);
  const pins: MapPin[] = sorted.map((facility) => ({
    id: facility.id,
    name: facility.name,
    lat: facility.lat,
    lng: facility.lng,
    address: facility.address,
    phone: facility.phone,
    facility,
  }));

  return (
    <div className="flex flex-col gap-3">
      {pins.length === 0 ? (
          <p role="note" className="text-sm text-muted-foreground">
            このタブには地図に表示できる位置情報を持つ施設がありません。
            {popupVariant === "full" && <span className="block mt-1">一覧のみに切り替えて確認してください。</span>}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            <MapView center={center} centerLabel={municipality} pins={pins} popupVariant={popupVariant} layout={layout} currentLocation={currentLocation} />
            {missingCount > 0 && (
              <p className="text-xs text-muted-foreground">
                {facilities.length}件中{pins.length}件を地図に表示しています(住所情報が無い施設は一覧のみでご案内します)。
              </p>
            )}
          </div>
        )}
    </div>
  );
}
