"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Archive, Settings2 } from "lucide-react";

import { TopReturnLink } from "@/components/common/TopReturnLink";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { HistoryCard } from "@/features/history/components/HistoryCard";
import { HistoryDetailView } from "@/features/history/components/HistoryDetailView";
import { clearAll, deleteResult, listResults, type HistoryEntry } from "@/features/history/services/history-store";
import { isHistoryEnabled } from "@/features/history/services/settings";

/**
 * 履歴画面(`app/history/page.tsx`)のクライアント側本体(TICKET-0026)。
 *
 * - AC-1: `listResults()`(日時降順、history-store.ts 側でソート済み)をそのままカード
 *   一覧として描画する。
 * - AC-2: カード選択時は一覧を隠し、`HistoryDetailView`(表示専用)に切り替える
 *   (ルーティングは増やさず、この画面内の状態のみで完結させる)。
 * - AC-3: 個別削除・全削除はいずれも `history-store.ts` の関数を呼び出し、
 *   成功時のみローカル state を更新する(NFR-37: 全削除は明示的な確認ボタンを挟む)。
 * - AC-4: 履歴が0件の場合、機能(`historyEnabled`)が OFF かどうかで文言を出し分ける。
 */
export function HistoryList() {
  const [isLoading, setIsLoading] = useState(true);
  const [entries, setEntries] = useState<HistoryEntry[]>([]);
  const [historyEnabled, setHistoryEnabled] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmingClearAll, setConfirmingClearAll] = useState(false);

  useEffect(() => {
    // HistoryTopLink と同じ方針: IndexedDB(非同期)の読み込みのため
    // useSyncExternalStore は使えず、effect 内で直接 promise を解決してから setState する。
    // アンマウント後の setState を避けるため `cancelled` フラグでガードする。
    let cancelled = false;
    void listResults().then((results) => {
      if (cancelled) {
        return;
      }
      setEntries(results);
      setHistoryEnabled(isHistoryEnabled());
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  async function handleDelete(id: string) {
    const ok = await deleteResult(id);
    if (!ok) {
      return;
    }
    setEntries((prev) => prev.filter((entry) => entry.id !== id));
    setSelectedId((current) => (current === id ? null : current));
  }

  async function handleClearAll() {
    setConfirmingClearAll(false);
    const ok = await clearAll();
    if (!ok) {
      return;
    }
    setEntries([]);
    setSelectedId(null);
  }

  if (isLoading) {
    return <HistoryListSkeleton />;
  }

  const selectedEntry = selectedId ? (entries.find((entry) => entry.id === selectedId) ?? null) : null;

  if (selectedEntry) {
    return (
      <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
        <HistoryDetailView entry={selectedEntry} onBack={() => setSelectedId(null)} />
      </main>
    );
  }

  return (
    <main id="main-content" tabIndex={-1} className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8 sm:py-12">
      <TopReturnLink />

      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">この端末の記録</p>
        <h1 className="text-xl font-bold text-foreground">これまでの記録</h1>
        <p className="text-sm text-muted-foreground">保存した結果の傾向を、あとから振り返れます。</p>
      </header>

      {entries.length === 0 ? (
        <EmptyState historyEnabled={historyEnabled} />
      ) : (
        <>
          <section aria-label="保存済みの記録について" className="flex flex-col gap-1 rounded-lg border border-border bg-muted/50 p-4 text-sm">
            <p className="font-semibold text-foreground">保存済み {entries.length}件</p>
            <p className="text-muted-foreground">回答内容やお住まいの地域は保存していません。この端末でのみ確認できます。</p>
          </section>

          <ul role="list" className="flex flex-col gap-3">
            {entries.map((entry) => (
              <HistoryCard key={entry.id} entry={entry} onSelect={setSelectedId} onDelete={handleDelete} />
            ))}
          </ul>

          <section aria-labelledby="history-data-management-heading" className="mt-2 flex flex-col gap-3 border-t border-border pt-5">
            <div>
              <h2 id="history-data-management-heading" className="text-sm font-semibold text-foreground">データ管理</h2>
              <p className="mt-1 text-sm text-muted-foreground">この端末に保存したすべての記録を削除できます。</p>
            </div>
            {!confirmingClearAll && (
              <Button type="button" variant="destructive" size="sm" className="self-start" onClick={() => setConfirmingClearAll(true)}>
                全件削除
              </Button>
            )}

            {confirmingClearAll && (
              <div className="flex w-full flex-col gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm">
                <p className="text-foreground">保存されている{entries.length}件の記録をすべて削除しますか?元に戻せません。</p>
                <div className="flex justify-end gap-2">
                  <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingClearAll(false)}>
                    キャンセル
                  </Button>
                  <Button type="button" variant="destructive" size="sm" onClick={() => void handleClearAll()}>
                    すべて削除する
                  </Button>
                </div>
              </div>
            )}
          </section>
        </>
      )}

    </main>
  );
}

/**
 * IndexedDB 読み込み待ち(`isLoading`)のスケルトン(方針: 画面読み込みは Skeleton で統一する。
 * `ResultView`/`ResultSubPageSkeleton` と同じ方針)。カード一覧の概形のみを示す。
 */
function HistoryListSkeleton() {
  return (
    <main
      aria-busy="true"
      aria-label="読み込み中"
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8 sm:py-12"
    >
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-col gap-2">
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-full max-w-sm" />
      </div>
      <Skeleton className="h-16 w-full rounded-lg" />
      <div className="flex flex-col gap-3">
        <Skeleton className="h-24 w-full rounded-lg" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </main>
  );
}

interface EmptyStateProps {
  historyEnabled: boolean;
}

/**
 * 履歴が0件のときの空状態(AC-4)。
 * `historyEnabled` の値に応じて「まだ保存していないだけ」なのか「機能自体が OFF」なのかを
 * 出し分ける。設定画面(`/settings`)自体は TICKET-0027 のためリンクのみを置く。
 */
function EmptyState({ historyEnabled }: EmptyStateProps) {
  return (
    <section className="flex flex-col gap-5 rounded-lg border border-dashed border-border bg-card p-5 text-left">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-muted p-2 text-primary">
          <Archive aria-hidden="true" className="size-5" />
        </div>
        <div className="flex flex-col gap-1">
          <h2 className="text-base font-semibold text-foreground">{historyEnabled ? "まだ保存した記録はありません" : "履歴保存はオフです"}</h2>
          <p className="text-sm text-muted-foreground">
            {historyEnabled
              ? "結果画面で保存した記録が、ここに時系列で表示されます。"
              : "履歴を有効にすると、結果画面から選んだ記録だけをこの端末に保存できます。"}
          </p>
        </div>
      </div>

      {!historyEnabled && (
        <div className="rounded-lg bg-muted/60 p-3 text-sm text-muted-foreground">
          保存するのは結果の傾向と保存日時のみです。回答内容・地域・自由記述は保存しません。共有端末では利用前にご確認ください。
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row">
        {!historyEnabled && (
          <Button render={<Link href="/settings" />} nativeButton={false} size="lg" className="w-full sm:w-auto">
            <Settings2 aria-hidden="true" />
            履歴保存を設定する
          </Button>
        )}
        <Button render={<Link href="/result" />} nativeButton={false} variant={historyEnabled ? "default" : "outline"} size="lg" className="w-full sm:w-auto">
          今の結果を確認する
        </Button>
      </div>
    </section>
  );
}
