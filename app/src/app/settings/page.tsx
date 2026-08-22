import type { Metadata } from "next";

import { resolveBackHref } from "@/components/common/report-form/back-href";
import { SettingsView } from "@/features/settings/components/SettingsView";

export const metadata: Metadata = {
  title: "設定・データ管理 | Trait Compass",
  robots: { index: false, follow: false },
};

interface SettingsPageProps {
  searchParams: Promise<{ back?: string | string[] }>;
}

/**
 * 設定・データ管理画面(TICKET-0027, FR-054)。
 * サーバーコンポーネントとしてはエントリーポイントのみを担い、localStorage/IndexedDB
 * を扱う実体は `SettingsView` に委譲する(project-structure.md §7: page.tsx は
 * データパススルーのみ、/history, /survey, /result と同じ方針)。
 *
 * `back` クエリ(遷移元のURL)を `resolveBackHref`(オープンリダイレクト対策込み、
 * /about・/help・/guide・/privacy・/terms と共通)で検証し、`SettingsView`(クライアント
 * コンポーネント)へ通常の props として渡す(未指定時はトップへ戻る)。
 */
export default async function SettingsPage({ searchParams }: SettingsPageProps) {
  const { back } = await searchParams;
  const backHref = resolveBackHref(back, "/");
  return <SettingsView backHref={backHref} />;
}
