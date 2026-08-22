"use client";

import { SettingsToggleRow } from "@/features/settings/components/SettingsToggleRow";

interface HistoryToggleProps {
  /** 履歴保存(IndexedDB への保存)が現在有効かどうか(呼び出し側=SettingsView が単一の情報源を持つ)。 */
  enabled: boolean;
  /** トグル操作時のコールバック。実際の永続化(setHistoryEnabled)は呼び出し側が担う。 */
  onToggle: (next: boolean) => void;
}

/**
 * 履歴保存トグル(TICKET-0027, FR-054)。
 *
 * - AC-1: デフォルト OFF(`enabled` の初期値は呼び出し側(SettingsView)で
 *   `isHistoryEnabled()` が返すデフォルト値 false から始まる)。
 * - AC-5: TICKET-0025 の同意フラグ(`history/services/settings.ts` の `historyEnabled`)と
 *   同じキーを読み書きするため、結果画面の同意フローと状態が連動する。
 * - ネイティブの `<input type=checkbox>` ではなく `role="switch"` を使うのは、
 *   ON/OFF の即時反映という「スイッチ」の意味論をスクリーンリーダー利用者にも
 *   明確に伝えるため(project-structure.md §10 の a11y 方針に準じ、意味のある
 *   状態は `aria-checked` で明示する)。
 */
export function HistoryToggle({ enabled, onToggle }: HistoryToggleProps) {
  return (
    <SettingsToggleRow
      title="履歴の保存"
      enabled={enabled}
      onToggle={onToggle}
      enabledDescription="結果画面から履歴を保存できます。"
      disabledDescription="結果は履歴に保存されません。"
    />
  );
}
