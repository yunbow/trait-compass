"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

import { InfoPageShell } from "@/components/common/InfoPageShell";
import {
  isHistoryEnabled,
  isGuideExplanationsEnabled,
  isSupportInputMemoryEnabled,
  setHistoryEnabled,
  setGuideExplanationsEnabled,
  setSupportInputMemoryEnabled,
} from "@/features/history/services/settings";
import { DataStorageExplanation } from "@/features/settings/components/DataStorageExplanation";
import { DeleteAllDataButton } from "@/features/settings/components/DeleteAllDataButton";
import { HistoryToggle } from "@/features/settings/components/HistoryToggle";
import { GuideExplanationsToggle } from "@/features/settings/components/GuideExplanationsToggle";
import { SupportInputMemoryToggle } from "@/features/settings/components/SupportInputMemoryToggle";

// ResumeBanner(survey/components/ResumeBanner.tsx)と同じ理由: localStorage は
// コンポーネント外部から変化しうる同期ストアなので、effect 内で setState するより
// useSyncExternalStore で読む方が素直(SSR/ハイドレーション安全)。この画面では
// 外部からの通知は発生しないため subscribe は no-op でよく、自分自身の書き込み後は
// `forceSync` で再レンダーを発生させて `getSnapshot` を再評価させる。
function subscribe() {
  return () => {};
}

function getServerSnapshot() {
  return false;
}

/**
 * 設定・データ管理画面(`app/settings/page.tsx`)のクライアント側本体(TICKET-0027)。
 *
 * - トグルの現在値(`historyEnabled`)は本コンポーネントが単一の情報源として持ち、
 *   `HistoryToggle` には値とコールバックのみを渡す(制御コンポーネント)。こうすることで
 *   `DeleteAllDataButton` による設定リセット(NFR-37)後も、トグルの表示を
 *   即座に「無効」へ同期できる。
 * - `backHref` は `settings/page.tsx` が `back` クエリを検証して渡す、遷移元に
 *   応じた戻り先(未指定時はトップ)。
 */
interface SettingsViewProps {
  backHref: string;
}

export function SettingsView({ backHref }: SettingsViewProps) {
  const historyEnabled = useSyncExternalStore(subscribe, isHistoryEnabled, getServerSnapshot);
  const supportInputMemoryEnabled = useSyncExternalStore(subscribe, isSupportInputMemoryEnabled, getServerSnapshot);
  const guideExplanationsEnabled = useSyncExternalStore(subscribe, isGuideExplanationsEnabled, () => true);
  const [, forceSync] = useState(0);
  const [statusMessage, setStatusMessage] = useState("");

  function handleToggle(next: boolean) {
    setHistoryEnabled(next);
    forceSync((n) => n + 1);
    setStatusMessage(`履歴の保存を${next ? "有効" : "無効"}にしました。`);
  }

  function handleSupportInputMemoryToggle(next: boolean) {
    setSupportInputMemoryEnabled(next);
    forceSync((n) => n + 1);
    setStatusMessage(`年齢と地域の保存を${next ? "有効" : "無効"}にしました。`);
  }

  function handleGuideExplanationsToggle(next: boolean) {
    setGuideExplanationsEnabled(next);
    forceSync((n) => n + 1);
    setStatusMessage(`結果画面の解説表示を${next ? "有効" : "無効"}にしました。`);
  }

  function handleAllDataDeleted() {
    forceSync((n) => n + 1);
    setStatusMessage("このブラウザに保存したデータを削除しました。設定は初期状態に戻りました。");
  }

  return (
    <InfoPageShell
      backHref={backHref}
      eyebrow="SETTINGS"
      title="設定・データ管理"
      lead="このブラウザに保存する情報と、保存済みデータを管理できます。"
      className="py-8 sm:py-12"
      heroExtra={
        <p className="mt-4 inline-flex items-center gap-2 text-sm text-foreground"><ShieldCheck aria-hidden="true" className="size-4 text-primary" />保存する情報は、この端末のブラウザにのみ保存されます。</p>
      }
    >
      <section className="flex flex-col gap-3">
        <div>
          <h2 className="text-sm font-semibold text-muted-foreground">保存する情報</h2>
          <p className="mt-1 text-sm text-muted-foreground">共有端末でも安心して使えるよう、保存は初期設定で無効です。</p>
        </div>
        <HistoryToggle enabled={historyEnabled} onToggle={handleToggle} />
        <SupportInputMemoryToggle enabled={supportInputMemoryEnabled} onToggle={handleSupportInputMemoryToggle} />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold text-muted-foreground">表示・便利機能</h2>
        <GuideExplanationsToggle enabled={guideExplanationsEnabled} onToggle={handleGuideExplanationsToggle} />
      </section>

      <p aria-live="polite" className="min-h-5 text-sm text-primary">
        {statusMessage}
      </p>

      <DataStorageExplanation />

      <DeleteAllDataButton onDeleted={handleAllDataDeleted} />

      <p className="text-center text-sm text-muted-foreground">
        データの取り扱いについて詳しくは{" "}
        <Link href="/privacy" className="underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          プライバシーポリシー
        </Link>
        をご確認ください。
      </p>
    </InfoPageShell>
  );
}
