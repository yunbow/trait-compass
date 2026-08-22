import { MapView } from "@/features/support/components/MapView";
import { SchoolCard, schoolId } from "@/features/support/components/SchoolCard";
import type { School } from "@/features/support/components/SchoolCard";
import { MUNICIPALITY_CENTERS } from "@/features/support/constants/municipality-centers";
import type { Municipality } from "@/features/support/constants/municipalities";
import { sortByDistanceFromCenter } from "@/features/support/services/distance";

export function SchoolMapSection({ municipality, schools, layout, popupVariant }: { municipality: Municipality; schools: School[]; layout: "sidebar" | "full"; popupVariant: "compact" | "full" }) {
  const center = MUNICIPALITY_CENTERS[municipality];
  const withCoords = schools.filter((school): school is School & { lat: number; lng: number } => typeof school.lat === "number" && typeof school.lng === "number");
  const pins = sortByDistanceFromCenter(withCoords, center).map((school) => ({ id: schoolId(school), name: school.name, lat: school.lat, lng: school.lng, address: school.address ?? null, fullPopup: <SchoolCard school={school} schools={schools} municipality={municipality} /> }));
  if (pins.length === 0) return <p role="note" className="text-sm text-muted-foreground">学校の住所・位置情報はまだ整備中のため、地図を表示できません。整備が完了すると、ここに各校のピンが表示されます。各校のカードにある「Googleマップで探す」から、おおよその位置を確認できます。{popupVariant === "full" && <span className="block mt-1">一覧のみに切り替えて確認してください。</span>}</p>;
  return <div className="flex flex-col gap-2"><MapView center={center} centerLabel={municipality} pins={pins} popupVariant={popupVariant} layout={layout} cardDomIdPrefix="school-card" />{pins.length < schools.length && <p className="text-xs text-muted-foreground">{schools.length}校中{pins.length}校を地図に表示しています(住所が未整備の学校は一覧でご案内します)。</p>}</div>;
}
