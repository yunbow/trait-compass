"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { clearAll } from "@/features/history/services/history-store";
import { DEFAULT_SETTINGS, saveSettings } from "@/features/history/services/settings";
import { clearSupportInputSelection } from "@/features/support/services/support-input-storage";
import { clearSurveyProgress } from "@/features/survey/services/progress";

type DeleteStep = "idle" | "confirming" | "deleting" | "done" | "failed";

interface DeleteAllDataButtonProps {
  /** 削除完了後に呼び出し側(SettingsView)の表示状態(履歴トグルの現在値等)を同期させるためのコールバック。 */
  onDeleted: () => void;
}

/**
 * 「すべてのデータを削除」ボタン(TICKET-0027, FR-054 AC-2, NFR-37)。
 *
 * 共有端末での事故防止のため、押下しても即座には削除せず明示的な確認ステップを挟む
 * (HistoryList の全件削除ボタンと同じ確認 UI パターン)。確認後は以下を全て実行する。
 * - IndexedDB の履歴(`history-store.ts` の `clearAll`)
 * - localStorage の回答進行状態(`survey/services/progress.ts` の `clearSurveyProgress`)
 * - localStorage の /support 選択(年齢・区市町村、`support-input-storage.ts` の `clearSupportInputSelection`)
 * - localStorage の設定(履歴保存トグル含む)を初期値にリセット(`settings.ts` の `saveSettings`)
 *
 * `clearSurveyProgress`/`saveSettings` は localStorage 書き込み失敗時も例外を投げず
 * 静かにフォールバックする設計(NFR-31)のため、成功/失敗の可視なフィードバックは
 * IndexedDB 側(`clearAll` の戻り値)を基準にする。
 */
export function DeleteAllDataButton({ onDeleted }: DeleteAllDataButtonProps) {
  const [step, setStep] = useState<DeleteStep>("idle");

  async function handleConfirm() {
    setStep("deleting");
    const historyCleared = await clearAll();
    clearSurveyProgress();
    clearSupportInputSelection();
    saveSettings(DEFAULT_SETTINGS);
    onDeleted();
    setStep(historyCleared ? "done" : "failed");
  }

  return (
    // 削除完了/失敗をスクリーンリーダーにも伝える(HistorySaveSection と同じ方針)。
    <section
      aria-live="polite"
      className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 className="text-base font-semibold text-destructive">危険な操作</h2>
        <p className="text-sm text-muted-foreground">
          このブラウザに保存した、回答途中のデータ・履歴・年齢と地域・設定をすべて削除します。
        </p>
        <p className="text-sm text-muted-foreground">共有済みのURLは無効になりません。共有した相手がURLを保持している場合、そのURLから内容を確認できます。</p>
      </div>

      {(step === "idle" || step === "done" || step === "failed") && (
        <Button
          type="button"
          variant="destructive"
          size="lg"
          className="border border-destructive/30"
          onClick={() => setStep("confirming")}
        >
          このブラウザの保存データをすべて削除
        </Button>
      )}

      {step === "confirming" && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm">
          <p className="font-semibold text-foreground">このブラウザに保存したデータをすべて削除しますか?</p>
          <div className="text-muted-foreground">
            削除するもの:
            <ul className="mt-1 list-disc pl-5">
              <li>回答途中の進行状況</li>
              <li>保存した結果(履歴)</li>
              <li>年齢・地域</li>
              <li>設定</li>
            </ul>
          </div>
          <p className="font-medium text-foreground">この操作は元に戻せません。</p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setStep("idle")}>
              キャンセル
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void handleConfirm()}>
              すべて削除
            </Button>
          </div>
        </div>
      )}

      {step === "deleting" && <p className="text-sm text-muted-foreground">削除しています…</p>}
      {step === "done" && <p className="text-sm text-muted-foreground">このブラウザに保存したデータを削除しました。</p>}
      {step === "failed" && (
        <p className="text-sm text-destructive">一部のデータ削除に失敗しました。もう一度お試しください。</p>
      )}
    </section>
  );
}
