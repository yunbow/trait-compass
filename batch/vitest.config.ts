import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: [
      "ingest/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules"],
  },
  resolve: {
    // tsconfig.json の paths("@/*": ["../app/src/*"])はtscの型解決にのみ効き、Vitest(Vite)の
    // 実行時モジュール解決には反映されない。app/src配下を相対importで再利用しているテスト
    // (municipality-registry.ts 経由の "@/data/..." 等)が ERR_MODULE_NOT_FOUND になるため、
    // ここでも同じエイリアスを明示する。
    alias: {
      "@": resolve(__dirname, "../app/src"),
    },
  },
});
