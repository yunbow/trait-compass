import Link from "next/link";
import type { ReactNode } from "react";

const triggerClassName =
  "flex h-9 items-center justify-center gap-1 rounded-md bg-muted/50 px-2 text-xs font-medium text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50";

interface AuxActionButtonProps {
  expanded: boolean;
  controlsId: string;
  onClick: () => void;
  icon: ReactNode;
  children: ReactNode;
}

export function AuxActionButton({ expanded, controlsId, onClick, icon, children }: AuxActionButtonProps) {
  return (
    <button type="button" aria-expanded={expanded} aria-controls={controlsId} onClick={onClick} className={triggerClassName}>
      {icon}
      {children}
    </button>
  );
}

interface AuxActionLinkProps {
  href: string;
  ariaLabel: string;
  icon: ReactNode;
  children: ReactNode;
}

export function AuxActionLink({ href, ariaLabel, icon, children }: AuxActionLinkProps) {
  return (
    <Link href={href} aria-label={ariaLabel} className={triggerClassName}>
      {icon}
      {children}
    </Link>
  );
}

interface AuxActionPanelProps {
  id: string;
  heading?: ReactNode;
  children: ReactNode;
}

export function AuxActionPanel({ id, heading = "出典・更新情報", children }: AuxActionPanelProps) {
  return (
    <div id={id} className="mt-3 rounded-lg bg-muted/50 p-3">
      <p className="text-xs font-medium text-foreground">{heading}</p>
      {children}
    </div>
  );
}

interface SourceListProps {
  sources: Array<{ label: string; url?: string | null; confirmedOn: string }>;
}

export function SourceList({ sources }: SourceListProps) {
  return (
    <ul className="mt-2 flex flex-col gap-1">
      {sources.map((source, index) => (
        <li key={`${source.label}-${index}`} className="text-xs text-muted-foreground">
          出典:{" "}
          {source.url ? (
            <a href={source.url} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
              {source.label}
            </a>
          ) : (
            source.label
          )}
          {`を加工して作成（確認日: ${source.confirmedOn}）`}
        </li>
      ))}
    </ul>
  );
}
