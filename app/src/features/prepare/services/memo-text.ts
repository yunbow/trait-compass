// 相談準備アシスタント(TICKET-0046 AC-3)の相談メモテキスト整形。
//
// クリップボードコピー用にプレーンテキストを組み立てる純関数。印刷は画面表示中の DOM を
// そのままブラウザ印刷機能(`window.print()` + `print:` ユーティリティによるレイアウト、
// components/PreparePanel.tsx を参照)に委ねるため、本ファイルはコピー用途のみを担う。

import type { PrepareResponse } from "@/features/prepare/schema/prepare";

function formatList(items: readonly string[]): string {
  return items.map((item) => `・${item}`).join("\n");
}

/**
 * `PrepareResponse` からクリップボードコピー用のプレーンテキストを組み立てる。
 * 見出し+箇条書きの単純なテキストとし、HTML/Markdown 記法は含めない。
 */
export function buildPrepareMemoText(memo: PrepareResponse): string {
  const sections = [
    "【相談メモ】",
    "",
    "■ 困りごとの要約",
    memo.summary,
    "",
    "■ 伝えるとよいこと",
    formatList(memo.checklist),
    "",
    "■ 当日の流れ/持ち物",
    formatList(memo.flow),
    "",
    "■ 聞いておきたいこと候補",
    formatList(memo.questions),
  ];

  if (memo.facilities.length > 0) {
    sections.push("", "■ 窓口候補");
    for (const facility of memo.facilities) {
      const lines = [`・${facility.name}(${facility.municipality})`];
      if (facility.address) lines.push(`  住所: ${facility.address}`);
      if (facility.phone) lines.push(`  電話: ${facility.phone}`);
      if (facility.url) lines.push(`  URL: ${facility.url}`);
      lines.push(`  ${facility.sourceCredit}`);
      sections.push(lines.join("\n"));
    }
  }

  if (memo.isFallback && memo.fallbackMessage) {
    sections.push("", memo.fallbackMessage);
  }

  return sections.join("\n");
}
