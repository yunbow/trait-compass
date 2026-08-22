"use client";

import { useEffect } from "react";
import { Check } from "lucide-react";

import { Button } from "@/components/ui/button";
import { ANSWER_OPTIONS } from "@/features/survey/constants/answer-labels";
import type { AnswerValue } from "@/features/survey/schema/question";
import { cn, prefersFinePointer } from "@/lib/utils";

interface AnswerChoiceProps {
  /** 現在の設問にすでに選ばれている値(未回答なら undefined)。 */
  selectedValue: AnswerValue | undefined;
  onSelect: (value: AnswerValue) => void;
  /**
   * 選択直後の一瞬の確認表示中(SurveyRunner の ANSWER_FEEDBACK_DELAY_MS)は true になり、
   * 連続クリック・数字キー連打による選び直しを防ぐ。
   */
  disabled?: boolean;
}

/**
 * 3件法の回答選択肢を大きなボタンで提示する(FR-012, NFR-44: 選択式優先・1指示1行)。
 * ネイティブ `<button>` を描画するため、Tab フォーカス・Enter/Space での選択は
 * ブラウザ標準の挙動としてそのまま満たされる(NFR-46)。
 */
export function AnswerChoice({ selectedValue, onSelect, disabled = false }: AnswerChoiceProps) {
  useEffect(() => {
    if (!prefersFinePointer()) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (disabled) {
        return;
      }
      const option = ANSWER_OPTIONS[Number(event.key) - 1];
      if (!option) {
        return;
      }
      event.preventDefault();
      onSelect(option.value);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onSelect, disabled]);

  return (
    <div role="group" aria-label="回答を選択してください" className="flex flex-col gap-3">
      {ANSWER_OPTIONS.map((option, index) => {
        const isSelected = selectedValue === option.value;

        return (
          <Button
            key={option.value}
            type="button"
            variant="outline"
            size="lg"
            aria-pressed={isSelected}
            aria-keyshortcuts={String(index + 1)}
            // 選択直後は他の選択肢だけを一時的にロックする(SurveyRunner の
            // ANSWER_FEEDBACK_DELAY_MS)。選んだボタン自体は disabled にしない
            // (Button の disabled:opacity-50 で選択直後の確認表示が薄れてしまうため)。
            disabled={disabled && !isSelected}
            className={cn(
              "h-auto min-h-20 w-full flex-row items-center justify-start gap-3 py-4 text-left",
              isSelected && "border-primary bg-white text-foreground shadow-sm hover:bg-muted dark:bg-card",
              !isSelected && "border-border bg-white shadow-sm hover:bg-muted dark:bg-card",
            )}
            onClick={() => onSelect(option.value)}
          >
            <span
              aria-hidden="true"
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-full border transition-colors sm:hidden",
                isSelected ? "border-primary bg-primary text-primary-foreground" : "border-primary/45 bg-background",
              )}
            >
              {isSelected && <Check className="size-4" strokeWidth={3} />}
            </span>
            <span
              aria-hidden="true"
              className={cn(
                "hidden size-6 shrink-0 items-center justify-center rounded-full border text-sm font-bold transition-colors sm:flex",
                isSelected
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-primary/45 bg-background text-foreground",
              )}
            >
              {index + 1}
            </span>
            <span className="flex min-w-0 flex-col gap-1.5">
              <span className="text-base font-semibold">{option.label}</span>
              <span className="text-sm leading-relaxed opacity-85">{option.helpText}</span>
            </span>
          </Button>
        );
      })}
    </div>
  );
}
