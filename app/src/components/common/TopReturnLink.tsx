import { GhostBackLink } from "@/components/common/GhostBackLink";

interface TopReturnLinkProps {
  className?: string;
}

/**
 * トップ画面へ戻るための共通リンク。設定画面とアンケート画面で同じ見た目に揃える。
 */
export function TopReturnLink({ className }: TopReturnLinkProps) {
  return (
    <GhostBackLink href="/" className={className}>
      トップへ戻る
    </GhostBackLink>
  );
}
