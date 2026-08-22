import { BackLinkButton } from "@/components/common/BackLinkButton";
import { FullPageFallback } from "@/components/common/FullPageFallback";

interface SupportResultsFallbackProps {
  title: string;
  description: string;
}

/**
 * 検索条件が不正な場合(age/municipality の Zod 検証失敗)・D1 が利用できない場合の空状態表示
 * (TICKET-0015)。どちらの場合も検索結果は表示せず、/support への差し戻し導線のみを提示する
 * (診断・判定語を使わない、NFR-51)。空状態であっても非診断の免責は表示する(NFR-52)。
 */
export function SupportResultsFallback({ title, description }: SupportResultsFallbackProps) {
  return (
    <FullPageFallback
      title={title}
      description={description}
      action={
        <BackLinkButton href="/support" className="w-full max-w-xs">
          条件を入力しなおす
        </BackLinkButton>
      }
    />
  );
}
