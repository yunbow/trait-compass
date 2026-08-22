"use client";

import { AlertDialog } from "@base-ui/react/alert-dialog";

import { Button } from "@/components/ui/button";

interface SkipConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * 早期スキップの確認ダイアログ(FR-01A)。
 *
 * ユーザーが明示的に「ここまでの回答で結果を見る」を操作した場合のみ表示し、
 * 確認なしに離脱・結果画面遷移が起きないようにする。催促・自動表示は行わない
 * (呼び出し側=SurveyRunner がユーザー操作でのみ open を true にする)。
 */
export function SkipConfirmDialog({ open, onOpenChange, onConfirm }: SkipConfirmDialogProps) {
  return (
    <AlertDialog.Root open={open} onOpenChange={onOpenChange}>
      <AlertDialog.Portal>
        <AlertDialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20" />
        <AlertDialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-lg border border-border bg-background p-5 text-left shadow-lg">
          <AlertDialog.Title className="text-base font-semibold text-foreground">
            ここまでの回答で途中結果を見ますか?
          </AlertDialog.Title>
          <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
            未回答のカテゴリは結果に表示されません。
          </AlertDialog.Description>
          <div className="mt-4 flex justify-end gap-2">
            <AlertDialog.Close render={<Button type="button" variant="ghost" />}>続ける</AlertDialog.Close>
            <Button type="button" onClick={onConfirm}>
              途中結果を見る
            </Button>
          </div>
        </AlertDialog.Popup>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
