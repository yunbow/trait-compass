#!/usr/bin/env node
// RAG 定量評価パイプライン(TICKET-0024)のエントリポイント。`npm run eval` から実行する。
//
// eval/retrieval.eval.ts(検索精度)・eval/generation.eval.ts(生成品質 Faithfulness)・
// eval/safety.eval.ts(安全性: 診断表現排除・危機介入ガード)の3つを実行し、Markdown レポートを
// eval/reports/ に出力する(gitignore 対象)。しきい値(eval/thresholds.json)を1つでも
// 下回った場合は非ゼロで終了する(危機介入の見逃しは1件でもあれば必ず失敗、NFR-74)。
//
// `EVAL_JUDGE=1` が設定されている場合のみ、第4層として eval/judge.eval.ts(LLM-as-judge)を
// 実行し、レポートに追加する。**既定(EVAL_JUDGE 未設定)ではこの層自体を import・実行せず、
// LLM 呼び出しは一切発生しない**(judge.eval.ts 自身も EVAL_JUDGE 未設定時はスキップする
// 二重の安全策になっているが、ここでは呼び出し自体を省略する形にした)。
//
// 実行: `node eval/run-all.mjs`(package.json の `npm run eval` から呼ばれる)。
// 個別のレイヤーだけを実行したい場合は各ファイルを直接実行できる:
//   `node --import ./eval/lib/register.mjs eval/retrieval.eval.ts`

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { register } from "node:module";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(HERE, "reports");

// eval/*.eval.ts が `@/...` エイリアス・拡張子省略の相対 import を使えるようにする
// (eval/lib/ts-loader.mjs 参照)。このファイル自身は既にロード済みなので、
// これ以降の動的 import() にのみ適用される。
register("./lib/ts-loader.mjs", import.meta.url);

async function main() {
  const startedAt = new Date();

  const runJudgeLayer = process.env.EVAL_JUDGE === "1";

  const [retrieval, generation, safety] = await Promise.all([
    import("./retrieval.eval.ts"),
    import("./generation.eval.ts"),
    import("./safety.eval.ts"),
  ]);

  const results = [
    { name: "retrieval", ...(await retrieval.run()) },
    { name: "generation", ...(await generation.run()) },
    { name: "safety", ...(await safety.run()) },
  ];

  if (runJudgeLayer) {
    const judge = await import("./judge.eval.ts");
    // judge.eval.ts の passed は初期段階では常に true(非ゲート、eval/thresholds.json の
    // judge セクション参照)。判定不能ケースも同様に passed: true 扱いのため、既存の
    // allPassed 判定に悪影響を与えない。
    results.push({ name: "judge", ...(await judge.run()) });
  }

  const finishedAt = new Date();
  const allPassed = results.every((r) => r.passed);

  const header = `# RAG 定量評価レポート(TICKET-0024)

- 実行日時: ${startedAt.toISOString()} 〜 ${finishedAt.toISOString()}
- 総合判定: ${allPassed ? "✅ PASS" : "❌ FAIL"}

| レイヤー | 判定 |
| --- | --- |
${results.map((r) => `| ${r.name} | ${r.passed ? "OK" : "NG"} |`).join("\n")}

---
`;

  const body = results.map((r) => r.markdown).join("\n---\n\n");
  const report = header + body;

  mkdirSync(REPORTS_DIR, { recursive: true });
  const timestamp = startedAt.toISOString().replace(/[:.]/g, "-");
  writeFileSync(path.join(REPORTS_DIR, `report-${timestamp}.md`), report, "utf8");
  writeFileSync(path.join(REPORTS_DIR, "latest.md"), report, "utf8");

  console.log(report);
  console.log(`\nレポートを eval/reports/report-${timestamp}.md (および latest.md) に出力しました。`);

  if (!allPassed) {
    console.error("\n[eval] しきい値を満たさないレイヤーがあります(詳細は上記レポート参照)。");
    process.exitCode = 1;
  }
}

await main();
