import { Button } from "@/components/ui/button";

export function ComparisonBar({ count, onCompare, onClear }: { count: number; onCompare: () => void; onClear: () => void }) {
  return <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-border bg-background p-3"><span aria-live="polite" className="text-sm">{count}件選択中</span><Button type="button" onClick={onCompare} disabled={count < 2}>比較する({count}件)</Button>{count < 2 && <span className="text-sm text-muted-foreground">2件以上選択すると比較できます</span>}{count >= 1 && <Button type="button" variant="ghost" onClick={onClear}>選択を解除</Button>}</div>;
}
