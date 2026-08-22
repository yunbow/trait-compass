"use client";

import { SettingsToggleRow } from "@/features/settings/components/SettingsToggleRow";

interface GuideExplanationsToggleProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
}

/** 結果画面に表示する制度・手続き解説の表示設定。 */
export function GuideExplanationsToggle({ enabled, onToggle }: GuideExplanationsToggleProps) {
  return (
    <SettingsToggleRow
      title="結果画面の解説を表示"
      enabled={enabled}
      onToggle={onToggle}
      enabledDescription="結果の見方や、制度・手続き・相談先についての補足説明を表示します。"
      disabledDescription="結果画面の制度・手続きの解説は表示しません。施設・窓口の情報は引き続き確認できます。"
    />
  );
}
