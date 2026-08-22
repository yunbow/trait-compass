"use client";

import { useEffect } from "react";

/**
 * フラグメントリンク(`#foo`)で閉じた `<details>` の中身へジャンプした場合に、対象の
 * `<details>` を自動展開する。HTML仕様上はブラウザがネイティブに行う挙動だが、確認した
 * 環境では発火しなかったため、hashchange・マウント時に明示的に `open` を設定して
 * 挙動を保証する。何も描画しないクライアントコンポーネント(PageReachTracker.tsx と
 * 同じパターン)。
 */
export function DetailsAnchorOpener() {
  useEffect(() => {
    function openTargetDetails() {
      const hash = window.location.hash.slice(1);
      if (!hash) return;
      const target = document.getElementById(hash);
      if (!target) return;
      const details = target.closest("details");
      if (details && !details.open) {
        details.open = true;
        requestAnimationFrame(() => {
          target.scrollIntoView({ block: "start" });
        });
      }
    }

    openTargetDetails();
    window.addEventListener("hashchange", openTargetDetails);
    return () => window.removeEventListener("hashchange", openTargetDetails);
  }, []);

  return null;
}
