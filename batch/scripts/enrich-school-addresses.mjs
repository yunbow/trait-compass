#!/usr/bin/env node
/**
 * 文部科学省の学校コード一覧を使い、手動調査 YAML の学校住所を補完する。
 */
import { readFile, writeFile } from "node:fs/promises";
import { isDeepStrictEqual } from "node:util";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

import { decodeCsvBuffer, parseCsv } from "./ingest-open-data.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const mextCsvPath = join(projectRoot, "data", "open-data", "mext-school-code-list", "mext-school-code-east.csv");
export const CONFIRMED_ON = "2026-07-20";
export const MEXT_SOURCE = {
  label: "文部科学省 学校コード一覧(CSV)",
  url: "https://www.mext.go.jp/b_menu/toukei/mext_01087.html",
  confirmedOn: CONFIRMED_ON,
};

// 一般的な表記ゆれを吸収せず、出典間で確認できた異体字だけを明示的に扱う。
export const KANJI_VARIANTS = { "曾": "曽" };
export const normalizeSchoolName = (name) => name.replace(/[曾]/g, (character) => KANJI_VARIANTS[character]);

/** 文科省 CSV の対象校を、学校名ごとの候補一覧へまとめる。 */
export function buildMextAddressIndex(rows) {
  const index = new Map();
  for (const row of rows.slice(1)) {
    const schoolType = row[1] ?? "";
    const level = schoolType.startsWith("B1")
      ? "elementary"
      : schoolType.startsWith("C1") ? "junior_high" : null;
    if (!level) continue;

    const name = row[5]?.trim();
    const address = row[6]?.trim();
    if (!name || !address) continue;
    const key = normalizeSchoolName(name);
    const candidates = index.get(key) ?? [];
    candidates.push({ address, level });
    index.set(key, candidates);
  }
  return index;
}

/** 学校名と校種が一意に一致した住所だけを返す。 */
export function matchSchool(index, municipalityName, school, level) {
  const key = normalizeSchoolName(`${municipalityName}立${school.name}`);
  const candidates = (index.get(key) ?? []).filter((candidate) => candidate.level === level);
  return candidates.length === 1 ? candidates[0] : null;
}

function sectionBounds(lines, section) {
  const start = lines.findIndex((line) => line === `${section}:`);
  if (start < 0) return null;
  const endOffset = lines.slice(start + 1).findIndex((line) => /^[^\s]/.test(line));
  return { start, end: endOffset < 0 ? lines.length : start + 1 + endOffset };
}

function schoolBlocks(lines, section) {
  const bounds = sectionBounds(lines, section);
  if (!bounds) return [];
  const starts = [];
  for (let line = bounds.start + 1; line < bounds.end; line += 1) {
    if (/^  - name: /.test(lines[line])) starts.push(line);
  }
  return starts.map((start, index) => ({ start, end: starts[index + 1] ?? bounds.end }));
}

function sourceInsertLine(lines, block) {
  const sourceLine = lines.findIndex((line, index) => index >= block.start && index < block.end && /^    sources:\s*$/.test(line));
  if (sourceLine < 0) return null;
  let end = sourceLine + 1;
  while (end < block.end && !/^ {0,4}\S/.test(lines[end])) end += 1;
  while (end > sourceLine + 1 && lines[end - 1] === "") end -= 1;
  return end;
}

function sourceLine(lines, block) {
  return lines.findIndex((line, index) => index >= block.start && index < block.end && /^    sources:/.test(line));
}

/**
 * YAML.stringify は "2026-07-20" のような日付形の文字列を無引用で出力するが、既存ファイルは
 * 常に引用符付き("2026-07-20")で統一している。書式を既存ファイルに合わせるため、
 * 日付形の文字列だけは明示的に引用符を付ける。
 */
const DATE_LIKE = /^\d{4}-\d{2}-\d{2}$/;
function stringifyScalar(value) {
  if (typeof value === "string" && DATE_LIKE.test(value)) return `"${value}"`;
  return YAML.stringify(value).trimEnd();
}

function sourceEntryLines(source) {
  return Object.entries(source).map(([key, value], index) => `${index === 0 ? "      - " : "        "}${key}: ${stringifyScalar(value)}`);
}

function expectedDocument(original, targets) {
  const expected = structuredClone(original);
  for (const target of targets) {
    const schools = expected[target.section] ?? [];
    const school = schools[target.ordinal];
    if (!school || school.address !== undefined) throw new Error(`編集対象の学校を確認できません: ${target.name}`);
    school.address = target.address;
    school.sources = [...(school.sources ?? []), target.source];
  }
  return expected;
}

/**
 * 指定された学校だけへ住所と出典を行単位で追加する。既存の書式とコメントは保持する。
 */
export function applyAddressEdits(yamlText, edits, municipalityName = "") {
  const original = YAML.parse(yamlText);
  const lines = yamlText.split("\n");
  const targets = [];

  for (const edit of edits) {
    const section = edit.level === "elementary" ? "elementarySchools" : "juniorHighSchools";
    const schools = original[section] ?? [];
    const matchingOrdinals = schools.flatMap((school, ordinal) => school.name === edit.name ? [ordinal] : []);
    if (matchingOrdinals.length !== 1) throw new Error(`編集対象の学校を一意に特定できません: ${edit.name}`);
    const ordinal = matchingOrdinals[0];
    if (schools[ordinal].address !== undefined) continue;
    targets.push({ ...edit, section, ordinal });
  }
  if (targets.length === 0) return yamlText;

  const changes = [];
  const appliedTargets = [];
  for (const target of targets) {
    const blocks = schoolBlocks(lines, target.section);
    const block = blocks[target.ordinal];
    if (!block) throw new Error(`YAML の学校ブロックを確認できません: ${target.name}`);

    const existingSourceLine = sourceLine(lines, block);
    if (existingSourceLine >= 0 && /^    sources:\s*&\S+\s*$/.test(lines[existingSourceLine])) {
      console.warn(`スキップ(アンカー定義のため): ${municipalityName} ${target.level} 「${target.name}」`);
      continue;
    }

    let addressLine = -1;
    for (let line = block.start + 1; line < block.end; line += 1) {
      if (/^    (?:level|areaHint):/.test(lines[line])) addressLine = line;
    }
    if (addressLine < 0) throw new Error(`address の挿入位置を確認できません: ${target.name}`);
    changes.push({ line: addressLine + 1, order: 0, lines: [`    address: ${YAML.stringify(target.address).trimEnd()}`] });

    const existingSourcesEnd = sourceInsertLine(lines, block);
    const sourceLines = sourceEntryLines(target.source);
    const isAlias = existingSourceLine >= 0 && /^    sources:\s*\*\S+\s*$/.test(lines[existingSourceLine]);
    let blockEnd = block.end;
    while (blockEnd > block.start && lines[blockEnd - 1] === "") blockEnd -= 1;
    changes.push(isAlias
      ? {
        line: existingSourceLine,
        deleteCount: 1,
        order: 1,
        lines: ["    sources:", ...(original[target.section][target.ordinal].sources ?? []).flatMap(sourceEntryLines), ...sourceLines],
      }
      : existingSourcesEnd === null
      ? { line: blockEnd, order: 1, lines: ["    sources:", ...sourceLines] }
      : { line: existingSourcesEnd, order: 1, lines: sourceLines });
    appliedTargets.push(target);
  }

  if (appliedTargets.length === 0) return yamlText;

  for (const change of changes.sort((left, right) => right.line - left.line || right.order - left.order)) {
    lines.splice(change.line, change.deleteCount ?? 0, ...change.lines);
  }
  const editedText = lines.join("\n");
  const actual = YAML.parse(editedText);
  const expected = expectedDocument(original, appliedTargets);
  if (!isDeepStrictEqual(actual, expected)) {
    throw new Error("YAML の安全検証に失敗しました。ファイルは書き込みません。");
  }
  return editedText;
}

async function main() {
  const inputPaths = process.argv.slice(2);
  if (inputPaths.length === 0) {
    throw new Error("使い方: node scripts/data/enrich-school-addresses.mjs <YAMLファイル> [<YAMLファイル>...]");
  }
  const rows = parseCsv(decodeCsvBuffer(await readFile(mextCsvPath)));
  const index = buildMextAddressIndex(rows);

  for (const inputPath of inputPaths) {
    const path = resolve(inputPath);
    const yamlText = await readFile(path, "utf8");
    const survey = YAML.parse(yamlText);
    const edits = [];
    for (const [level, section] of [["elementary", "elementarySchools"], ["junior_high", "juniorHighSchools"]]) {
      for (const school of survey[section] ?? []) {
        if (school.address !== undefined) continue;
        const match = matchSchool(index, survey.municipalityName, school, level);
        if (match) edits.push({ name: school.name, level, address: match.address, source: MEXT_SOURCE });
        else console.warn(`未マッチ(スキップ): ${survey.municipalityName} ${level} 「${school.name}」`);
      }
    }
    const editedText = applyAddressEdits(yamlText, edits, survey.municipalityName);
    if (editedText !== yamlText) await writeFile(path, editedText, "utf8");
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((error) => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
}
