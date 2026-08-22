#!/usr/bin/env node
/**
 * 設問の仕様文書(Markdown、社内管理・本リポジトリには含まれない)をパースして
 * src/data/questions.json を生成するスクリプト。設問文自体の追加・変更は現状この
 * スクリプトを経由せず、生成済みの src/data/questions.json を直接編集する運用でよい。
 *
 * - `## N. ラベル (category-key)` の見出しからカテゴリを抽出する
 * - `| ND-XXXX | 質問文 | 関連特性 |` の表行から質問データを抽出する
 * - 242問・10カテゴリ・カテゴリ別問数・ID重複なしを検証し、不一致であれば exit 1 する
 *
 * 実行: node scripts/build-questions.mjs (または npm run build:questions)
 */
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SPEC_PATH = path.resolve(__dirname, "../../docs/spec/survey-questions.md");
const OUTPUT_PATH = path.resolve(__dirname, "../src/data/questions.json");

// カテゴリ一覧の順序・問数(合計242問)。
const EXPECTED_CATEGORY_COUNTS = {
  communication: 27,
  "social-reading": 27,
  "emotion-regulation": 25,
  "impulse-memory": 25,
  "executive-function": 25,
  "kindness-misread": 26,
  sensory: 26,
  motor: 27,
  learning: 26,
  "restricted-repetitive": 8,
};
const CATEGORY_ORDER = Object.keys(EXPECTED_CATEGORY_COUNTS);
const EXPECTED_TOTAL = Object.values(EXPECTED_CATEGORY_COUNTS).reduce((sum, n) => sum + n, 0);

const TRAIT_KEYS = ["ASD", "ADHD", "LD", "DCD"];
const GRAY_ZONE_LABEL = "gray-zone";

// 例: "## 10. こだわり・反復 (restricted-repetitive)"
const HEADING_RE = /^##\s*\d+\.\s*.+?\(([a-z-]+)\)\s*$/;
// 例: "| ND-0001 | 誰かの話の途中でも... | ASD, ADHD |"
// 先頭セルが ND-#### 形式であることを要求するため、見出し行・区切り行は自然にマッチしない。
const ROW_RE = /^\|\s*(ND-\d{4})\s*\|\s*(.+?)\s*\|\s*(.+?)\s*\|\s*$/;

function fail(message) {
  console.error(`[build-questions] ${message}`);
  process.exit(1);
}

function parseMarkdown(markdown) {
  const lines = markdown.split(/\r?\n/);
  let currentCategory = null;
  const questions = [];

  for (const line of lines) {
    const heading = line.match(HEADING_RE);
    if (heading) {
      currentCategory = heading[1];
      continue;
    }

    const row = line.match(ROW_RE);
    if (!row) continue;

    const [, id, text, rawTraits] = row;
    if (!currentCategory) {
      fail(`カテゴリ見出しより前に質問行が出現しました: ${id}`);
    }
    if (!CATEGORY_ORDER.includes(currentCategory)) {
      fail(`未知のカテゴリ key です: "${currentCategory}" (${id})`);
    }

    const traitTokens = rawTraits
      .split(",")
      .map((token) => token.trim())
      .filter(Boolean);

    for (const token of traitTokens) {
      if (token !== GRAY_ZONE_LABEL && !TRAIT_KEYS.includes(token)) {
        fail(`未知の特性ラベルです: "${token}" (${id})`);
      }
    }

    questions.push({
      id,
      text,
      category: currentCategory,
      traits: TRAIT_KEYS.filter((trait) => traitTokens.includes(trait)),
      grayZone: traitTokens.includes(GRAY_ZONE_LABEL),
    });
  }

  return questions;
}

function validate(questions) {
  if (questions.length !== EXPECTED_TOTAL) {
    fail(`質問数が ${EXPECTED_TOTAL} 件ではありません(実際: ${questions.length} 件)`);
  }

  const seenIds = new Set();
  for (const question of questions) {
    if (seenIds.has(question.id)) {
      fail(`ID が重複しています: ${question.id}`);
    }
    seenIds.add(question.id);
  }

  const categoriesFound = new Set(questions.map((question) => question.category));
  if (categoriesFound.size !== CATEGORY_ORDER.length) {
    fail(
      `カテゴリ数が ${CATEGORY_ORDER.length} 種ではありません(実際: ${categoriesFound.size} 種: ${[...categoriesFound].join(", ")})`,
    );
  }

  for (const category of CATEGORY_ORDER) {
    if (!categoriesFound.has(category)) {
      fail(`カテゴリが見つかりません: ${category}`);
    }
  }

  for (const [category, expectedCount] of Object.entries(EXPECTED_CATEGORY_COUNTS)) {
    const actualCount = questions.filter((question) => question.category === category).length;
    if (actualCount !== expectedCount) {
      fail(
        `カテゴリ "${category}" の問数が一致しません(期待: ${expectedCount} 件 / 実際: ${actualCount} 件)`,
      );
    }
  }
}

function main() {
  const markdown = readFileSync(SPEC_PATH, "utf-8");
  const questions = parseMarkdown(markdown);
  validate(questions);

  writeFileSync(OUTPUT_PATH, `${JSON.stringify(questions, null, 2)}\n`, "utf-8");
  console.log(
    `[build-questions] OK: ${questions.length} 件の質問データを ${path.relative(process.cwd(), OUTPUT_PATH)} に書き出しました。`,
  );
}

main();
