"use client";

import { useRouter } from "next/navigation";
import type { MouseEvent } from "react";

import { hasAppNavigationOccurred } from "@/components/common/report-form/app-navigation-session";

/**
 * 「検索結果に戻る」等の戻るリンク用クリックハンドラ(P0対応)。
 *
 * `facility-report`・`content-report` 等の報告ページは、以前は `back` クエリに遷移元
 * (検索結果ページ)の URL を path+query そのまま埋め込んでいた。検索結果ページの URL には
 * 年齢・区市町村・相談分野タグ等の検索条件が含まれるため、報告ページ自身の URL にも
 * それらが二重に残ってしまう(受動的プライバシーリスク)。
 *
 * このタブでアプリ内のページ遷移が既に発生している場合(通常のアプリ内遷移)は `history.back()`
 * で戻り、URL に検索条件を一切残さない(判定は `app-navigation-session.ts` 参照。
 * `window.history.length` は新規タブでもブラウザ内部のエントリを含み2以上になりうるため、
 * 判定材料として使わない)。直接アクセス・ブックマーク等でアプリ内遷移が無い場合のみ、
 * リンクの `href`(検索条件を含まない汎用的な遷移先、例: `/support`)への通常遷移に任せる。
 */
export function useSmartBackClickHandler(): (event: MouseEvent<HTMLAnchorElement>) => void {
  const router = useRouter();

  return (event: MouseEvent<HTMLAnchorElement>) => {
    // 新しいタブで開く・修飾キー併用時はブラウザの既定動作(href への通常遷移)に任せる。
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
      return;
    }
    if (hasAppNavigationOccurred()) {
      event.preventDefault();
      router.back();
    }
  };
}
