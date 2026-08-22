#!/usr/bin/env node
// TICKET-0003 AC-5: `export const runtime = "edge"` の禁止を機械的に検出する。
//
// 本アプリは @opennextjs/cloudflare(Node.js ランタイム必須)を使ってデプロイするため、
// Next.js の Edge Runtime(`export const runtime = "edge"`)は OpenNext 非対応(NFR-11)。
// src/app 配下に紛れ込むとビルド・デプロイ時に気づきにくいため、CI/レビュー時に
// grep ベースで検出する。
//
// 使い方: npm run check:edge-runtime

import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const TARGET_DIR = join(process.cwd(), "src", "app");
// `runtime = "edge"` / `runtime = 'edge'` のどちらの引用符も検出する。
const EDGE_RUNTIME_PATTERN = /export\s+const\s+runtime\s*=\s*["']edge["']/;

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      walk(fullPath, files);
    } else if (/\.(ts|tsx|js|jsx)$/.test(entry)) {
      files.push(fullPath);
    }
  }
  return files;
}

function main() {
  let files;
  try {
    files = walk(TARGET_DIR);
  } catch (err) {
    if (err.code === "ENOENT") {
      // src/app が存在しない構成もあり得るため、その場合は検査対象なしとして成功扱いにする。
      console.log(`check:edge-runtime: ${relative(process.cwd(), TARGET_DIR)} が存在しないためスキップします。`);
      return;
    }
    throw err;
  }

  const violations = files.filter((file) => EDGE_RUNTIME_PATTERN.test(readFileSync(file, "utf8")));

  if (violations.length > 0) {
    console.error("check:edge-runtime: 次のファイルに `export const runtime = \"edge\"` が見つかりました。");
    console.error("OpenNext(@opennextjs/cloudflare)は Edge Runtime 非対応のため削除してください。");
    for (const file of violations) {
      console.error(`  - ${relative(process.cwd(), file)}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("check:edge-runtime: OK (export const runtime = \"edge\" は見つかりませんでした)");
}

main();
