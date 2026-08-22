#!/usr/bin/env node
/**
 * 掲載情報の訂正・更新報告(`facility_reports`/`content_reports`)のレビュー運用CLI(Phase 0 §3-1)。
 *
 * 既存の運用手順が定める生SQLを `wrangler d1 execute` 経由でラップするだけの薄いツールで、
 * 暗記不要にし運用ミス(誤UPDATE)を減らすのが目的。トリアージの判断基準・実際のデータ修正手順は
 * 既存の運用手順の管轄のままで、このスクリプトは代替しない。
 *
 * 使い方:
 *   node scripts/report-review.mjs list [--local|--remote]
 *   node scripts/report-review.mjs done <id> [--local|--remote]
 *   node scripts/report-review.mjs dismiss <id> [--local|--remote]
 */
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

// npm scripts resolve `wrangler` through node_modules/.bin. Resolve that same
// project-local executable explicitly because this script can also run via node
// (ingest-manual-survey.mjs と同じ理由)。
const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const wranglerPath = join(projectRoot, "node_modules", ".bin", "wrangler");
// `wrangler d1 execute <database-name>` は cwd から wrangler.toml/wrangler.jsonc を
// 探索するが、batch/ にはそれらが無い(wrangler.ingest.toml のみ)ため既定探索では見つからない
// (batch/ から素の `wrangler d1 execute trait-compass --local` を叩くと
// "Couldn't find a D1 DB with the name or binding 'trait-compass'" で失敗することを確認済み)。
// database_name="trait-compass" を宣言している wrangler.ingest.toml を明示的に指定する。
const wranglerConfigPath = join(projectRoot, "batch", "wrangler.ingest.toml");

// facility_reports/content_reports の id は crypto.randomUUID() で発行される(route.ts参照)。
const REPORT_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const LIST_COLUMNS = {
  facility_reports: "id, created_at, facility_name, municipality, report_category, closure_status, corrected_value, detail_text",
  content_reports: "id, created_at, target_type, target_label, municipality, report_category, corrected_value, detail_text",
};

const STATUS_BY_COMMAND = { done: "done", dismiss: "dismissed" };

export function buildListSql(table) {
  return `SELECT ${LIST_COLUMNS[table]} FROM ${table} WHERE status='new' ORDER BY created_at DESC`;
}

/** UPDATE 文を組み立てる。id は `wrangler d1 execute --command` へ直接埋め込むため、
 *  SQLインジェクション対策として UUID 形式であることを事前に検証する。
 *  status_updated_at も同時に更新する(migration 0027、自由記述の保持期限90日の起算点、
 *  report-retention.ts が参照する)。 */
export function buildStatusUpdateSql(table, id, status) {
  if (!REPORT_ID_RE.test(id)) {
    throw new Error(`不正な報告ID形式です(UUID形式ではありません): ${id}`);
  }
  return `UPDATE ${table} SET status='${status}', status_updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id='${id}'`;
}

export function parseTargetFlag(flags) {
  const hasLocal = flags.includes("--local");
  const hasRemote = flags.includes("--remote");
  if (hasLocal === hasRemote) {
    throw new Error("--local または --remote のいずれか一方を指定してください。");
  }
  return hasRemote ? "--remote" : "--local";
}

function runD1(sql, target) {
  const result = spawnSync(
    wranglerPath,
    ["d1", "execute", "trait-compass", target, "-c", wranglerConfigPath, "--command", sql],
    { stdio: "inherit" },
  );
  if (result.status !== 0) process.exitCode = 1;
}

function runList(flags) {
  const target = parseTargetFlag(flags);
  console.log("=== facility_reports (status='new') ===");
  runD1(buildListSql("facility_reports"), target);
  console.log("\n=== content_reports (status='new') ===");
  runD1(buildListSql("content_reports"), target);
}

/**
 * facility_reports/content_reports の id はテーブル間でグローバルに一意な UUID のため、
 * どちらのテーブルに該当するかは事前にわからない。両テーブルへ同じ `WHERE id=?` を発行し、
 * 該当しない側は0件更新のまま何も起きない(該当する側のみ実際に更新される)。
 */
function runStatusUpdate(command, id, flags) {
  const target = parseTargetFlag(flags);
  const status = STATUS_BY_COMMAND[command];
  runD1(buildStatusUpdateSql("facility_reports", id, status), target);
  runD1(buildStatusUpdateSql("content_reports", id, status), target);
}

function main() {
  const [command, ...rest] = process.argv.slice(2);

  if (command === "list") {
    runList(rest);
    return;
  }

  if (command === "done" || command === "dismiss") {
    const [id, ...flags] = rest;
    if (!id) {
      throw new Error(`使い方: node scripts/report-review.mjs ${command} <id> [--local|--remote]`);
    }
    runStatusUpdate(command, id, flags);
    return;
  }

  throw new Error("使い方: node scripts/report-review.mjs <list|done|dismiss> [<id>] [--local|--remote]");
}

// テスト(vitest)からこのファイルを import した際に CLI 実行(main）が副作用として走らないよう、
// 直接実行されたときのみ起動するガード(validate-manual.mjs / ingest-manual-survey.mjs と同じ)。
const isDirectlyExecuted = process.argv[1] && import.meta.url === `file://${resolve(process.argv[1])}`;
if (isDirectlyExecuted) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
