"use client";

import { SettingsToggleRow } from "@/features/settings/components/SettingsToggleRow";

interface SupportInputMemoryToggleProps {
  /** /support の年齢・区市町村の記憶が現在有効かどうか(呼び出し側=SettingsView が単一の情報源を持つ)。 */
  enabled: boolean;
  /** トグル操作時のコールバック。実際の永続化(setSupportInputMemoryEnabled)は呼び出し側が担う。 */
  onToggle: (next: boolean) => void;
}

/**
 * 年齢・地域の保存トグル(TICKET-0027、設定分離)。
 *
 * - 既定 OFF。「履歴の保存」(HistoryToggle)とは独立した設定であり、/support(年齢・区市町村選択
 *   画面)での入力内容を localStorage に記憶するかどうかのみを制御する(NFR-32)。
 */
export function SupportInputMemoryToggle({ enabled, onToggle }: SupportInputMemoryToggleProps) {
  return (
    <SettingsToggleRow
      title="年齢と地域の保存"
      enabled={enabled}
      onToggle={onToggle}
      enabledDescription="支援情報を探す画面(/support)で入力した年齢・区市町村を、このブラウザに保存して次回の入力を省略します。"
      disabledDescription="支援情報を探す画面での年齢・区市町村の入力は保存されません。"
    />
  );
}
