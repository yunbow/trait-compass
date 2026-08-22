import type { Metadata } from "next";

import { HistoryList } from "@/features/history/components/HistoryList";

export const metadata: Metadata = {
  title: "履歴 | Trait Compass",
  robots: { index: false, follow: false },
};

/**
 * 履歴画面(TICKET-0026, FR-052)。
 * サーバーコンポーネントとしてはエントリーポイントのみを担い、IndexedDB からの読み込み・
 * 表示専用モードの切り替え・削除操作は `HistoryList` に委譲する
 * (project-structure.md §7: page.tsx はデータパススルーのみ、/survey, /result と同じ方針)。
 */
export default function HistoryPage() {
  return <HistoryList />;
}
