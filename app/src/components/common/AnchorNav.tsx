export interface AnchorNavItem {
  /** ページ内フラグメント(例: "#terms-scope")。 */
  href: string;
  label: string;
}

interface AnchorNavProps {
  /** `aria-label`(例: "利用規約の目次")。1画面に複数の nav があるため必須。 */
  label: string;
  items: readonly AnchorNavItem[];
}

/**
 * 情報ページ(/about・/privacy・/terms)の目次。リンクのフォーカスリング・下線スタイルと
 * `aria-label` 付き `<nav>` を1箇所に集約する。
 */
export function AnchorNav({ label, items }: AnchorNavProps) {
  return (
    <nav
      aria-label={label}
      className="flex flex-wrap gap-x-4 gap-y-2 border-y border-border py-3 text-sm text-muted-foreground"
    >
      {items.map((item) => (
        <a
          key={item.href}
          href={item.href}
          className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          {item.label}
        </a>
      ))}
    </nav>
  );
}
