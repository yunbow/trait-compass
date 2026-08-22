"use client";

import { useEffect, useState } from "react";

import { PRINT_MODE_ATTRIBUTE, PRINT_MODE_VALUE } from "@/components/common/printMemoMode";

interface UseMemoPrintCopyOptions {
  getCopyText: () => string;
}

interface UseMemoPrintCopyResult {
  copyState: "idle" | "copied" | "error";
  handlePrint: () => void;
  handleCopy: () => Promise<void>;
}

/**
 * 相談メモの印刷/コピー操作ロジック(TICKET-0046 AC-3)。
 *
 * `PrepareMemo`(選択式モード)と `SummaryMemo`(AI自由記述モード)で完全に一致していた
 * 状態管理(`copyState`・`afterprint` でのクリア・`handlePrint`・`handleCopy`)を抽出したもの。
 * コピー元テキストの組み立て方のみが呼び出し側ごとに異なるため `getCopyText` で受け取る。
 * DOM・JSXは一切含まない(ボタンのvariantやヒント文の差異は各コンポーネント側の責務)。
 */
export function useMemoPrintCopy({ getCopyText }: UseMemoPrintCopyOptions): UseMemoPrintCopyResult {
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");

  useEffect(() => {
    function clearPrintMode() {
      document.documentElement.removeAttribute(PRINT_MODE_ATTRIBUTE);
    }
    window.addEventListener("afterprint", clearPrintMode);
    return () => window.removeEventListener("afterprint", clearPrintMode);
  }, []);

  function handlePrint() {
    document.documentElement.setAttribute(PRINT_MODE_ATTRIBUTE, PRINT_MODE_VALUE);
    window.print();
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(getCopyText());
      setCopyState("copied");
    } catch {
      setCopyState("error");
    }
  }

  return { copyState, handlePrint, handleCopy };
}
