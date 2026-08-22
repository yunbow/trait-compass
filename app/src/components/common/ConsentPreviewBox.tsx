import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";

interface ConsentPreviewBoxProps {
  /** 「送信されるもの」ブロックの中身。各featureが `<p className="text-foreground">` 行を渡す。 */
  sent: ReactNode;
  /** 「送信されないもの」ブロックの中身。 */
  notSent: ReactNode;
  /** CategoryExplainSection のAI事業者ポリシー注記のような任意の追加段落。既定は表示しない。 */
  note?: ReactNode;
  /**
   * true: AskAiPanel系(外枠 bg-card + p-3、CTAボタン size="sm")。
   * false(既定): AiSummarySection/CategoryExplainSection/RecommendHintSection系
   * (外枠 bg無し + p-4、CTAボタン size="lg")。
   */
  dense?: boolean;
  /** 『同意して送信』クリック時に呼ぶコールバック。fetchはここでは発行しない(呼び出し元の責務)。 */
  onConsent: () => void;
  /** 『キャンセル』クリック時に呼ぶコールバック。 */
  onCancel: () => void;
}

/**
 * 外部の生成AIサービスへ送信する前の同意プレビューUI(FR-041)。
 * AiSummarySection/AskAiPanel/CategoryExplainSection/RecommendHintSectionの4箇所で
 * 文言・構造が完全一致していたため集約した。見出し・ラベル・CTA文言は固定とし、
 * 呼び出し元からの上書きは許可しない(表記ゆれ防止)。fetch呼び出しはonConsent側の責務。
 */
export function ConsentPreviewBox({ sent, notSent, note, dense = false, onConsent, onCancel }: ConsentPreviewBoxProps) {
  const buttonSize = dense ? "sm" : "lg";

  return (
    <div
      className={
        dense
          ? "flex flex-col gap-3 rounded-lg border border-border bg-card p-3 text-sm"
          : "flex flex-col gap-3 rounded-lg border border-border p-4 text-sm"
      }
    >
      <p className="font-semibold text-foreground">送信内容を確認してください。</p>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">送信されるもの</p>
        {sent}
      </div>

      <div className="flex flex-col gap-1">
        <p className="text-xs font-medium text-muted-foreground">送信されないもの</p>
        {notSent}
      </div>

      {note}

      <div className="flex flex-col gap-2">
        <Button type="button" size={buttonSize} className="w-full" onClick={onConsent}>
          <Sparkles aria-hidden="true" />
          同意して送信
        </Button>
        <Button type="button" variant="ghost" size={buttonSize} className="w-full" onClick={onCancel}>
          キャンセル
        </Button>
      </div>
    </div>
  );
}
