import * as fs from "node:fs";
import * as path from "node:path";

import { expect, test } from "@playwright/test";
import type { Page } from "@playwright/test";

import { PERSONAS, type PersonaBehavior } from "./personas";
import { readQaLogEvents } from "./qa-log-inspector";

/**
 * AI ペルソナ UX テスト(TICKET-0030, NFR-76)。
 *
 * 4ペルソナ(標準/ADHD 傾向/ASD 傾向/感覚過敏)それぞれについて、決定的な行動パラメータ
 * (personas.ts)に沿ってアンケート回答〜結果表示までを自動操作し、QA 専用ログ
 * (`window.__ND_QA_LOGGING__` フラグ注入、NFR-39)から完走有無・所要時間・戻る回数・
 * 離脱位置を集計して `test-results/persona-report.json` に出力する。
 *
 * 重要な限界(NFR-76): これは実在当事者の行動を代替するものではない、決定的スクリプトに
 * よる一次スクリーニング・リグレッション補助である。最終判断には当事者テスト・専門家
 * レビューを併用すること。
 *
 * 4ペルソナの結果を1つのレポートに集約するため、`test.describe.configure({ mode: "serial" })`
 * で単一ワーカー・順次実行を強制し、最後の「レポート出力」テストでまとめて書き出す。
 */

const QUESTION_COUNT = 30;
const REPORT_PATH = path.join("test-results", "persona-report.json");

interface PersonaReportEntry {
  key: string;
  label: string;
  description: string;
  evaluationFocus: string[];
  completed: boolean;
  answeredCount: number;
  backCount: number;
  interruptCount: number;
  durationMs: number | null;
  dropOffQuestionText: string | null;
}

interface PersonaRunResult {
  completed: boolean;
  answeredCount: number;
  backCount: number;
  interruptCount: number;
  durationMs: number | null;
  dropOffQuestionText: string | null;
}

async function skipTransitionIfShown(page: Page): Promise<void> {
  const skipButton = page.getByRole("button", { name: "すぐ進む" });
  if (await skipButton.isVisible().catch(() => false)) {
    await skipButton.click();
  }
}

/**
 * ペルソナの行動パラメータに沿って `/survey` を先頭から完走まで自動操作する。
 * `/` から開始し、完走できた場合は結果画面(`/result`)への遷移まで行う。
 */
async function runPersonaSurvey(page: Page, persona: PersonaBehavior): Promise<PersonaRunResult> {
  // NFR-39: QA 専用ログはこのフラグ注入によってのみ有効化される。本番コードはこのフラグを
  // 自ら設定することは無い(src/lib/qa-log/qa-logger.ts を参照)。
  await page.addInitScript(() => {
    window.__ND_QA_LOGGING__ = true;
  });
  if (persona.reducedMotion) {
    await page.emulateMedia({ reducedMotion: "reduce" });
  }

  await page.goto("/");
  await page.getByRole("button", { name: "はじめる" }).click();
  await expect(page).toHaveURL(/\/survey$/);

  const finishHeading = page.getByRole("heading", { level: 1, name: "回答ありがとうございました" });

  let backCount = 0;
  let interruptCount = 0;
  let answeredCount = 0;
  let dropOffQuestionText: string | null = null;
  let completed = false;

  for (let i = 0; i < QUESTION_COUNT; i++) {
    if (persona.shouldInterrupt(i)) {
      // ブラウザリロードによる「中断」。進行状態は localStorage から復元されるため、
      // 同じ設問位置(FR-015)から自動的に「再開」される。
      await page.reload();
      interruptCount += 1;
    }

    await skipTransitionIfShown(page);

    dropOffQuestionText = (await page.getByRole("heading", { level: 1 }).textContent()) ?? dropOffQuestionText;

    await page.waitForTimeout(persona.answerDelayMs(i));

    await page.getByRole("button", { name: "よくある" }).click();
    answeredCount += 1;

    if (await finishHeading.isVisible().catch(() => false)) {
      completed = true;
      break;
    }

    await skipTransitionIfShown(page);

    if (persona.shouldGoBack(i)) {
      // 一度「前の質問へ」で戻って確認し、同じ回答で再度進む(戻る操作の再現)。
      await page.getByRole("button", { name: "前の質問へ" }).click();
      backCount += 1;
      await skipTransitionIfShown(page);
      await page.getByRole("button", { name: "よくある" }).click();
      answeredCount += 1;
      await skipTransitionIfShown(page);

      if (await finishHeading.isVisible().catch(() => false)) {
        completed = true;
        break;
      }
    }
  }

  if (!completed) {
    await skipTransitionIfShown(page);
    completed = await finishHeading.isVisible().catch(() => false);
  }

  if (completed) {
    await page.getByRole("button", { name: "結果を見る" }).click();
    await expect(page).toHaveURL(/\/result$/);
  }

  const events = await readQaLogEvents(page);
  const completeEvent = events.find((event) => event.type === "complete");

  return {
    completed,
    answeredCount,
    backCount,
    interruptCount,
    durationMs: completeEvent ? completeEvent.elapsedMs : null,
    dropOffQuestionText: completed ? null : dropOffQuestionText,
  };
}

const reportEntries: PersonaReportEntry[] = [];

test.describe.configure({ mode: "serial" });

test.describe("AI ペルソナ UX テスト(TICKET-0030, NFR-76)", () => {
  for (const persona of PERSONAS) {
    test(`${persona.label}ペルソナ: アンケート回答〜結果表示`, async ({ page }) => {
      const result = await runPersonaSurvey(page, persona);

      // AC-2 の評価観点のうち、機械的に判定できるものはここでアサーションとして組み込む。
      // NFR-42: タイマー・カウントダウン・残り時間の表示が一切無いこと。
      await expect(page.getByText(/残り\d+秒|タイムアウト|カウントダウン/)).toHaveCount(0);
      // NFR-45: 進捗表示は視覚スケールのみで、%表示のような数値進捗は出さない。
      await expect(page.getByText(/^\d+%$/)).toHaveCount(0);

      expect(result.completed, `${persona.label}: 30問完走(または中断・再開を経て完走)できること`).toBe(true);

      reportEntries.push({
        key: persona.key,
        label: persona.label,
        description: persona.description,
        evaluationFocus: persona.evaluationFocus,
        completed: result.completed,
        answeredCount: result.answeredCount,
        backCount: result.backCount,
        interruptCount: result.interruptCount,
        durationMs: result.durationMs,
        dropOffQuestionText: result.dropOffQuestionText,
      });
    });
  }

  test("集計レポートを test-results/persona-report.json に出力する", () => {
    expect(reportEntries).toHaveLength(PERSONAS.length);

    fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
    fs.writeFileSync(
      REPORT_PATH,
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          disclaimer:
            "本レポートは決定的にエンコードされた行動パラメータによる自動シナリオの結果であり、" +
            "実在当事者の行動を代替するものではない(NFR-76)。一次スクリーニング・リグレッション補助として" +
            "利用し、最終判断には当事者テスト・専門家レビューを必ず併用すること。",
          personas: reportEntries,
        },
        null,
        2,
      ),
    );
  });
});
