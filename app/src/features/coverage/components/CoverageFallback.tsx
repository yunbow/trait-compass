import { FullPageFallback } from "@/components/common/FullPageFallback";

/**
 * D1 バインディングが無い環境(ローカル未セットアップ等)向けの graceful degradation
 * (TICKET-0029)。SupportResultsFallback と異なり、このページには「条件を入力しなおす」ような
 * やり直し導線が無い(検索条件を伴わない啓発ページのため)ため、専用の空状態を用意する。
 */
export function CoverageFallback() {
  return (
    <FullPageFallback
      title="データカバレッジ可視化は現在準備中です。"
      description="データベースに接続できないため、区市町村別の集計結果を表示できません。しばらくしてから、もう一度お試しください。"
    />
  );
}
