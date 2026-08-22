import { FullPageFallback } from "@/components/common/FullPageFallback";

/**
 * D1 バインディングが無い環境(ローカル未セットアップ等)向けの graceful degradation
 * (TICKET-0065)。CoverageFallback と同じく、このページには「条件を入力しなおす」ような
 * やり直し導線が無い(検索条件を伴わない情報公開ページのため)ため、専用の空状態を用意する。
 */
export function DataSourcesFallback() {
  return (
    <FullPageFallback
      title="利用しているデータの一覧は現在準備中です。"
      description="データベースに接続できないため、データの一覧を表示できません。しばらくしてから、もう一度お試しください。"
    />
  );
}
