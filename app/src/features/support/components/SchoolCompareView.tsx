"use client";

import { useEffect, useRef } from "react";
import { ExternalLink } from "lucide-react";

import { Button } from "@/components/ui/button";
import { FULLSCREEN_OVERLAY_CLASSNAME, FullscreenToggleButton } from "@/features/support/components/FullscreenToggleButton";
import { FixedClassBadges, formatResourceRoomLabel } from "@/features/support/components/SchoolCard";
import { useFullscreen } from "@/features/support/hooks/use-fullscreen";
import type { School } from "@/features/support/components/SchoolCard";
import { buildGoogleMapsSearchHref } from "@/features/support/services/google-maps-link";
import { cn } from "@/lib/utils";

export function SchoolCompareView({ schools, allSchools, municipality, onBack }: { schools: School[]; allSchools: School[]; municipality: string; onBack: () => void }) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  useEffect(() => headingRef.current?.focus(), []);
  const { fullscreen, toggle } = useFullscreen();
  const mapLink = (school: School) => <a href={buildGoogleMapsSearchHref({ lat: school.lat ?? null, lng: school.lng ?? null, address: school.address ?? null, fallbackQuery: `${municipality}${school.name}` })} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-medium text-primary underline underline-offset-2">Googleマップで探す<ExternalLink aria-hidden="true" className="size-3" /></a>;
  return <section role={fullscreen ? "dialog" : undefined} aria-modal={fullscreen || undefined} aria-label={fullscreen ? "学校の比較" : undefined} className={cn("flex flex-col gap-4", fullscreen && FULLSCREEN_OVERLAY_CLASSNAME)}><Button type="button" variant="outline" className="self-start" onClick={onBack}>一覧に戻る</Button><div className="flex items-center justify-between gap-3"><h2 ref={headingRef} tabIndex={-1} className="text-xl font-semibold outline-none focus-visible:ring-3 focus-visible:ring-ring/50">学校の比較</h2><FullscreenToggleButton fullscreen={fullscreen} onToggle={toggle} expandLabel="比較表を拡大" /></div><div className={cn("overflow-auto", fullscreen && "min-h-0 flex-1")}><table className="w-full border-collapse text-left text-sm"><thead><tr><th scope="col" className="min-w-32 border border-border bg-muted p-3">項目</th>{schools.map((school) => <th key={schoolIdKey(school)} scope="col" className="min-w-[220px] border border-border p-3"><div>{school.name}</div><span className="font-normal text-muted-foreground">{school.level === "elementary" ? "小学校" : "中学校"}</span></th>)}</tr></thead><tbody>
    <Row label="地域の目安" schools={schools} render={(school) => school.areaHint ?? "—"} /><Row label="固定級" schools={schools} render={(school) => <FixedClassBadges school={school} />} /><Row label="固定級の備考" schools={schools} render={(school) => { const notes = school.fixedClasses.filter((item) => item.note); return notes.length ? notes.map((item) => <p key={item.note}>{item.note}</p>) : "—"; }} /><Row label="特別支援教室" schools={schools} render={(school) => school.resourceRoom?.hasResourceRoom ? <>{formatResourceRoomLabel(school, allSchools)}{school.resourceRoom.groupName && <p className="mt-1 text-muted-foreground">{school.resourceRoom.groupName}</p>}</> : "—"} /><Row label="学区の備考" schools={schools} render={(school) => school.districtNote ?? "—"} /><Row label="地図" schools={schools} render={mapLink} />
  </tbody></table></div></section>;
}
function schoolIdKey(school: School) { return `${school.level}:${school.name}`; }
function Row({ label, schools, render }: { label: string; schools: School[]; render: (school: School) => React.ReactNode }) { return <tr><th scope="row" className="border border-border bg-muted p-3 font-medium">{label}</th>{schools.map((school) => <td key={schoolIdKey(school)} className="border border-border p-3 align-top">{render(school)}</td>)}</tr>; }
