import type { MapPin } from "@/features/support/components/MapView";

export function MapPopupCard({ pin, onShowDetails }: { pin: MapPin; onShowDetails: () => void }) {
  return (
    <div className="flex max-w-72 flex-col gap-1 text-left text-sm text-foreground">
      <p className="font-semibold">{pin.name}</p>
      {pin.address && <p className="text-xs text-muted-foreground">{pin.address}</p>}
      {pin.phone && <p className="text-xs">{pin.phone}</p>}
      <button type="button" onClick={onShowDetails} className="mt-1 min-h-11 rounded-md border border-border bg-white px-3 text-sm font-medium shadow-sm hover:bg-muted dark:bg-card">
        一覧で詳細を見る
      </button>
    </div>
  );
}
