// ローカル D1(wrangler d1 execute --local)への読み取り専用アクセスヘルパー。
//
// eval ハーネス(eval/retrieval.eval.ts 等)は Next.js のリクエストコンテキスト外(単なる
// `node` プロセス)から動くため、`src/lib/db/index.ts` の `getDb()`(`getCloudflareContext()`
// 前提)は使えない。CI(GitHub Actions 等)でも「実 DB(ローカル D1)+シードで完結」させる
// ため(ticket 記載の方針)、`wrangler d1 execute --local --json --command` を子プロセスとして
// 呼び出し、JSON 結果をそのまま返す薄いラッパーとする。
//
// **用途を読み取り専用の固定クエリに限定すること**: `sql` はこのファイル内(eval/*.eval.ts)から
// 渡される定数・fixture 由来の値のみを想定しており、エンドユーザー入力を扱う経路には
// 一切使わない(この点で security.md のバインドパラメータ必須方針の対象外 — 本番コードではない)。
//
// **`EVAL_D1_REMOTE=1`(本番/リモート D1 への読み取り)**: 設定時は `--local` の代わりに
// `--remote` を渡す(cwd は変わらず `app/`。`app/wrangler.toml` の database_id が本番と同一の
// D1 を指しているため、`batch/wrangler.ingest.toml` のように `-c` で別 config を明示する必要は
// ない)。**このモジュールは SELECT のみが発行される前提**(呼び出し元は `d1-shim.ts` 経由の
// `searchFacilities`/`fetchFacilitiesByIds` のみで、どちらも SELECT 専用)であり、
// `--remote` 指定時に書き込み系 SQL を渡すと本番データを直接変更してしまうため、
// 呼び出し元を増やす場合は SELECT 限定であることを維持すること。

import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// eval/lib/d1.ts から2階層上(eval/lib → eval → app)。
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

/**
 * `wrangler` バイナリの解決先。npm workspaces(このリポジトリは `app/`/`batch/` の2ワークスペース)
 * では依存関係が monorepo ルートの `node_modules/.bin/` にホイストされ、`app/node_modules/.bin/`
 * 配下には存在しないことがある(インストール状況によって変わる)ため、`app/` 直下→ monorepo
 * ルート直下の順に存在確認する。
 */
function resolveWranglerBin(): string {
  const localBin = path.join(REPO_ROOT, "node_modules", ".bin", "wrangler");
  if (existsSync(localBin)) return localBin;
  const hoistedBin = path.join(REPO_ROOT, "..", "node_modules", ".bin", "wrangler");
  if (existsSync(hoistedBin)) return hoistedBin;
  // どちらにも見つからない場合はローカル想定のパスのまま返し、実行時のエラーメッセージ
  // (queryD1 の catch)に委ねる。
  return localBin;
}

const WRANGLER_BIN = resolveWranglerBin();

/** `db:seed:local:manual` と同じデータベース名(wrangler.toml の `database_name`)。 */
const DEFAULT_DB_NAME = "trait-compass";

function resolveDbName(): string {
  return process.env.EVAL_D1_NAME || DEFAULT_DB_NAME;
}

/** `EVAL_D1_REMOTE=1` の場合はリモート(本番)D1 を、それ以外はローカル D1 を対象にする。 */
function resolveTargetFlag(): "--local" | "--remote" {
  return process.env.EVAL_D1_REMOTE === "1" ? "--remote" : "--local";
}

interface WranglerExecuteResult<T> {
  results?: T[];
  success?: boolean;
}

/**
 * ローカル D1 に対して1つの SQL 文を実行し、結果行を返す。
 * `npm run db:migrate:local && npm run db:seed:local:manual` が未実行の場合や wrangler/miniflare の
 * ローカル状態が壊れている場合は、原因を含むエラーメッセージで例外を投げる
 * (呼び出し側 = eval/*.eval.ts が catch してレポートに「D1 未準備」として記録する)。
 */
export function queryD1<T = Record<string, unknown>>(sql: string): T[] {
  const targetFlag = resolveTargetFlag();
  let stdout: string;
  try {
    stdout = execFileSync(WRANGLER_BIN, ["d1", "execute", resolveDbName(), targetFlag, "--json", "--command", sql], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    const hint =
      targetFlag === "--remote"
        ? "CLOUDFLARE_ACCOUNT_ID/CLOUDFLARE_API_TOKEN 等、wrangler のリモート認証設定を確認してください。"
        : "`npm run db:migrate:local && npm run db:seed:local:manual` を実行済みか確認してください。";
    throw new Error(`D1(${resolveDbName()}, ${targetFlag})へのクエリに失敗しました。${hint}\n原因: ${detail}`);
  }

  let parsed: WranglerExecuteResult<T>[];
  try {
    parsed = JSON.parse(stdout) as WranglerExecuteResult<T>[];
  } catch {
    throw new Error(`wrangler d1 execute の出力を JSON として解釈できませんでした:\n${stdout.slice(0, 500)}`);
  }

  return parsed[0]?.results ?? [];
}

/**
 * ローカル D1 が疎通可能か(migrate/seed 済みか)を判定する。
 * retrieval eval 等がレポート冒頭で前提条件を明示するために使う。
 */
export function isD1Available(): boolean {
  try {
    queryD1("SELECT 1 AS ok");
    return true;
  } catch {
    return false;
  }
}
