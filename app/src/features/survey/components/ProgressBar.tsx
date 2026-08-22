import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { CATEGORY_KEYS } from "@/features/survey/schema/question";
import type { CategoryKey } from "@/features/survey/schema/question";
import { cn } from "@/lib/utils";

interface ProgressBarProps {
  currentCategory: CategoryKey;
  currentQuestion: number;
  totalQuestions: number;
}

/**
 * カテゴリ単位セグメント進捗(FR-013, NFR-45)。
 *
 * - %数値・タイマーは一切表示しない(NFR-42, NFR-45)。質問番号とカテゴリセグメントで現在地を示す。
 * - `role="progressbar"` + `aria-valuenow`/`aria-valuemin`/`aria-valuemax` + `aria-label` を
 *   付与し、スクリーンリーダーでも「N/全問」と現在カテゴリが伝わるようにする(NFR-46)。
 * - 各セグメントは装飾(aria-hidden)として扱い、進捗値は親要素の aria 属性に一本化する。
 * - 「質問 N/30」の直下に置く通常フロー要素(画面下部固定ではない)。上部の質問番号表示と
 *   現在地情報が離れて見える問題への対応として、SurveyRunner 側で質問番号のすぐ下に配置する。
 */
export function ProgressBar({ currentCategory, currentQuestion, totalQuestions }: ProgressBarProps) {
  const currentCategoryIndex = CATEGORY_KEYS.indexOf(currentCategory);
  const currentPosition = currentCategoryIndex + 1;

  return (
    <div
      role="progressbar"
      aria-valuenow={currentQuestion}
      aria-valuemin={1}
      aria-valuemax={totalQuestions}
      aria-label={`進捗: ${currentQuestion}/${totalQuestions}問目、カテゴリ${currentPosition}/${CATEGORY_KEYS.length}(${CATEGORY_LABELS[currentCategory]})`}
      className="flex gap-1"
    >
      {CATEGORY_KEYS.map((category, index) => {
        const status = index < currentCategoryIndex ? "done" : index === currentCategoryIndex ? "current" : "upcoming";
        return (
          <span
            key={category}
            aria-hidden="true"
            className={cn(
              "h-1.5 flex-1 rounded-full",
              status === "done" && "bg-primary",
              status === "current" && "bg-primary/60",
              status === "upcoming" && "bg-muted",
            )}
          />
        );
      })}
    </div>
  );
}
