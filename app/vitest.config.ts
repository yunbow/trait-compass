import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "path";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: [
      "src/**/*.{test,spec}.{ts,tsx}",
      // eval/ ハーネス自体の純関数(メトリクス計算)のみ対象(eval/*.eval.ts は品質測定の
      // 実行スクリプトでありユニットテストではないため対象外。npm run eval で別途実行する)。
      "eval/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", ".next"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "json-summary", "json"],
      reportsDirectory: "./coverage",
      // 重要ファイルのホワイトリスト方式(NFR-71)。後続チケットでスコアリング等の
      // 純関数を追加した際にここへ追記する。
      include: [
        "src/features/survey/services/questions.ts",
        "src/features/survey/services/scoring.ts",
        "src/features/survey/services/progress.ts",
        "src/features/survey/schema/question.ts",
        "src/features/result/services/chart-data.ts",
        "src/features/result/services/explanation.ts",
        "src/features/result/services/share-codec.ts",
        "src/features/history/services/history-store.ts",
        "src/features/history/services/settings.ts",
        "src/features/ai-summary/schema/summarize.ts",
        "src/features/ai-summary/services/crisis-detection.ts",
        "src/features/ai-summary/services/output-guard.ts",
        "src/features/ai-summary/services/prompt.ts",
        "src/features/data-ingest/services/licenseClassifier.ts",
        "src/features/support/services/dataset-status.ts",
        "src/features/support/services/facility-search.ts",
        "src/features/support/services/facility-display.ts",
        "src/features/support/services/results-url.ts",
        "src/features/support/services/facility-vector-search.ts",
        "src/features/support/services/school-info.ts",
        "src/features/support/schema/results-search-params.ts",
        "src/features/support/constants/category-types.ts",
        "src/features/recommend/schema/recommend.ts",
        "src/features/recommend/services/query-text.ts",
        "src/features/recommend/services/prompt.ts",
        "src/features/recommend/services/fact-guard.ts",
        "src/features/recommend/services/facility-recommend.ts",
        "src/features/explain/schema/explain.ts",
        "src/features/explain/services/category-evidence.ts",
        "src/features/explain/services/prompt.ts",
        "src/features/coverage/services/aggregate-coverage.ts",
        "src/lib/qa-log/qa-logger.ts",
        "src/lib/ai/rate-limit.ts",
        "src/lib/ai/ai-feature-flag.ts",
        "src/lib/api/ai-error-codes.ts",
      ],
      exclude: ["**/__tests__/**", "**/*.test.{ts,tsx}", "**/*.spec.{ts,tsx}", "**/node_modules/**", "**/.next/**"],
    },
  },
  resolve: {
    alias: {
      "@": resolve(__dirname, "./src"),
    },
  },
});
