import { FullPageFallback } from "@/components/common/FullPageFallback";

/**
 * D1 バインディングが無い環境(ローカル未セットアップ等)向けの graceful degradation。
 * CoverageFallback・DataSourcesFallback と同じ方針(TICKET-0029/TICKET-0065)を踏襲する。
 * このページは「回答0件」自体は誠実な空状態として通常表示するため、このフォールバックは
 * あくまで D1 に接続できない場合(getDb() が throw する場合)専用。
 */
export function OutcomesFallback() {
  return (
    <FullPageFallback
      title="Trait Compass の成果は現在準備中です。"
      description="データベースに接続できないため、集計結果を表示できません。しばらくしてから、もう一度お試しください。"
    />
  );
}
