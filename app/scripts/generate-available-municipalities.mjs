#!/usr/bin/env node
/**
 * data/manual/municipalities/*.yaml のファイル名一覧から、実データのある自治体コードを
 * 抽出して src/data/available-municipality-codes.json を生成するスクリプト。
 *
 * Cloudflare Workers ランタイムは data/manual/ を直接読めないため、選択 UI
 * (MunicipalityCombobox)がデータの無い自治体を候補に出さないよう、ビルド前にこの
 * スクリプトで静的な JSON として書き出す。data/manual/municipalities/ にファイルを
 * 追加・削除したら再実行すること: npm run build:available-municipalities
 */
import { readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUNICIPALITIES_DIR = path.resolve(__dirname, "../../data/manual/municipalities");
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/available-municipality-codes.json");

// 例: "13381-miyake.yaml" -> "13381"
const FILENAME_CODE_RE = /^(\d{5})-.+\.yaml$/;

function fail(message) {
  console.error(`[generate-available-municipalities] ${message}`);
  process.exit(1);
}

function main() {
  const files = readdirSync(MUNICIPALITIES_DIR).filter((file) => file.endsWith(".yaml"));
  if (files.length === 0) fail(`YAML が1件も見つかりません: ${MUNICIPALITIES_DIR}`);

  const codes = [];
  for (const file of files) {
    const match = file.match(FILENAME_CODE_RE);
    if (!match) fail(`ファイル名からコードを抽出できません(先頭5桁-ローマ字.yaml 形式ではない): ${file}`);
    codes.push(match[1]);
  }
  codes.sort();

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(codes, null, 2)}\n`, "utf-8");
  console.log(
    `[generate-available-municipalities] OK: ${codes.length} 件のコードを ${path.relative(process.cwd(), OUTPUT_PATH)} に書き出しました。`,
  );
}

main();
