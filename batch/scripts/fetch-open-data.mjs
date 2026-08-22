#!/usr/bin/env node
/**
 * data/open-data/sources.yaml に定義された原本データをローカルにキャッシュする。
 *
 * 取得時点・ハッシュ・ファイルサイズを fetch-meta.json に記録し、次回取得時に
 * 原本が変わったかを確認できるようにする。ZIP はダウンロードした原本を残したまま
 * extracted/ 以下へ展開する。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { basename, dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import YAML from "yaml";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const sourcesPath = join(projectRoot, "data", "open-data", "sources.yaml");
const requestTimeoutMs = 30_000;
const requestIntervalMs = 1_000;

/** ダウンロードしたバイナリの内容を識別する SHA-256 を返す。 */
export function computeSha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

/** manifest の filename、または URL のファイル名から保存名を決める。 */
export function resolveFilename(file) {
  if (file.filename) return file.filename;

  const filename = decodeURIComponent(basename(new URL(file.url).pathname));
  return filename || "download";
}

/** 前回の fetch-meta.json と比較したファイルごとの更新状態を返す。 */
export function diffAgainstPreviousMeta(previousMeta, files) {
  const previousHashes = new Map(
    (previousMeta?.files ?? []).map((file) => [file.filename, file.sha256]),
  );

  return files.map((file) => ({
    ...file,
    status: !previousHashes.has(file.filename)
      ? "added"
      : previousHashes.get(file.filename) === file.sha256
        ? "unchanged"
        : "changed",
  }));
}

/** サーバーに負荷を掛けないため、複数ファイルの間隔を空ける。 */
function waitForRequestInterval() {
  return new Promise((resolveWait) => setTimeout(resolveWait, requestIntervalMs));
}

/** タイムアウト付きで原本ファイルを取得する。 */
async function downloadFile(file) {
  const abortController = new AbortController();
  const timeout = setTimeout(() => abortController.abort(), requestTimeoutMs);

  try {
    const response = await fetch(file.url, {
      headers: {
        "User-Agent": "trait-compass-data-fetch/1.0 (local research cache)",
      },
      signal: abortController.signal,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }

    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("30秒でタイムアウトしました。");
    }
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

/** ZIP 原本を extracted/<zip名>/ に展開する。 */
function extractZip(zipPath, outputDirectory) {
  const result = spawnSync("unzip", ["-o", zipPath, "-d", outputDirectory], {
    encoding: "utf8",
  });

  if (result.error?.code === "ENOENT") {
    throw new Error("unzip コマンドが見つかりません。macOS/Linux の unzip を利用可能にしてください。");
  }
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(`ZIP展開に失敗しました: ${result.stderr || "unknown error"}`);
  }
}

/** 1つの source に含まれる全原本をキャッシュし、取得メタ情報を更新する。 */
async function fetchSource(source) {
  const sourceDirectory = join(projectRoot, "data", "open-data", source.id);
  const metaPath = join(sourceDirectory, "fetch-meta.json");
  await mkdir(sourceDirectory, { recursive: true });

  const previousMeta = await readFile(metaPath, "utf8")
    .then(JSON.parse)
    .catch(() => null);
  const fetchedFiles = [];

  for (const [index, file] of (source.files ?? []).entries()) {
    if (index > 0) {
      await waitForRequestInterval();
    }

    const filename = resolveFilename(file);
    const buffer = await downloadFile(file);
    const filePath = join(sourceDirectory, filename);
    await writeFile(filePath, buffer);

    if (file.extract) {
      const extractDirectory = join(
        sourceDirectory,
        "extracted",
        basename(filename, extname(filename)),
      );
      await mkdir(extractDirectory, { recursive: true });
      extractZip(filePath, extractDirectory);
    }

    fetchedFiles.push({
      url: file.url,
      filename,
      sha256: computeSha256(buffer),
      bytes: buffer.length,
    });
  }

  for (const file of diffAgainstPreviousMeta(previousMeta, fetchedFiles)) {
    console.log(`${source.id}: ${file.filename} ${file.status}`);
  }

  const meta = {
    sourceId: source.id,
    fetchedAt: new Date().toISOString(),
    files: fetchedFiles,
  };
  await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
}

async function main() {
  const sources = YAML.parse(await readFile(sourcesPath, "utf8"));
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const requestedIds = process.argv.slice(2);
  const invalidIds = requestedIds.filter((id) => !sourceById.has(id));

  if (invalidIds.length > 0) {
    throw new Error(`sources.yaml に存在しない source-id: ${invalidIds.join(", ")}`);
  }

  const selectedSources = requestedIds.length > 0
    ? requestedIds.map((id) => sourceById.get(id))
    : sources;
  const failures = [];

  for (const [index, source] of selectedSources.entries()) {
    if (index > 0) {
      await waitForRequestInterval();
    }

    if (source.already_wired_in_ingest_worker) {
      console.log(`${source.id}: skip (ingest workerで既に取込済み)`);
      continue;
    }
    if (source.fetch === "skip") {
      console.log(`${source.id}: skip (fetch: skip)`);
      // 機械可読ファイルがない source も、後段で datasets メタ情報だけを
      // 取り込めるよう空の取得メタ情報を残す。ネットワークアクセスは行わない。
      await fetchSource(source);
      continue;
    }

    try {
      await fetchSource(source);
    } catch (error) {
      const message = error instanceof Error ? error.message : error;
      failures.push(`${source.id}: ${message}`);
    }
  }

  if (failures.length > 0) {
    console.error(`取得失敗:\n${failures.join("\n")}`);
    process.exitCode = 1;
  }
}

// テストから import した際に CLI 実行の副作用を起こさないよう、直接実行時だけ起動する。
const isDirectlyExecuted = process.argv[1]
  && import.meta.url === `file://${resolve(process.argv[1])}`;
if (isDirectlyExecuted) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
