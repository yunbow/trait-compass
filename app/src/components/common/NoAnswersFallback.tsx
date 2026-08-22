import Link from "next/link";

import { FullPageFallback } from "@/components/common/FullPageFallback";
import { Button } from "@/components/ui/button";

/** セルフチェック未回答時の空状態(結果関連の各サブページ共通)。 */
export function NoAnswersFallback() {
  return (
    <FullPageFallback
      title="まだ回答がありません。"
      description="アンケートに回答すると、この機能が使えます。"
      action={
        <>
          <Button render={<Link href="/survey" />} nativeButton={false} size="lg" className="w-full max-w-xs">
            チェックを始める
          </Button>
          <Button render={<Link href="/result" />} nativeButton={false} variant="ghost" size="lg" className="w-full max-w-xs">
            結果画面へ戻る
          </Button>
        </>
      }
    />
  );
}
