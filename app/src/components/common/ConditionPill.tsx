interface ConditionPillProps {
  /** 「地域」「年齢」等のラベル。省略時は値のみ表示する。 */
  label?: string;
  value: string;
  /** "card"(既定): FacilityResultsView/PurposeSelectionForm系の見た目。 "outline": Prepare/Recommend/SupportInputForm系の見た目。 */
  variant?: "card" | "outline";
}

/** 「現在の検索条件」等を示すラベル+値のピル表示。variantごとに既存の見た目を維持する。 */
export function ConditionPill({ label, value, variant = "card" }: ConditionPillProps) {
  if (variant === "outline") {
    return <span className="rounded-full border border-primary/30 bg-background px-2 py-1 text-xs text-foreground">{label ? `${label} ${value}` : value}</span>;
  }
  if (label) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-card px-2.5 py-1">
        <span className="text-xs text-muted-foreground">{label}</span>
        <span className="font-medium text-foreground">{value}</span>
      </span>
    );
  }
  return <span className="rounded-full bg-card px-2.5 py-1 text-xs text-foreground">{value}</span>;
}

/** タグ配列の先頭max件をピル表示し、残りは「+n件」の1ピルにまとめる省略表示ヘルパー。 */
export function ConditionPillList({ tags, max = 3, variant }: { tags: string[]; max?: number; variant?: "card" | "outline" }) {
  const visible = tags.slice(0, max);
  const overflow = tags.length - max;
  return (
    <>
      {visible.map((tag) => (
        <ConditionPill key={tag} value={tag} variant={variant} />
      ))}
      {overflow > 0 && <ConditionPill value={`+${overflow}件`} variant={variant} />}
    </>
  );
}
