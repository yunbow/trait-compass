// `D1Database` の最小シム実装。retrieval eval が本番と同じ関数
// (`searchFacilities`/`fetchFacilitiesByIds`, `@/features/support/services/facility-search`)を
// 一切改変せずそのまま呼び出せるようにするための橋渡し。
//
// なぜ必要か: 本番コードは `getDb()`(`getCloudflareContext().env.DB`)経由で `D1Database` を
// 取得するが、これは Next.js のリクエストコンテキスト前提であり、単体の `node` プロセスである
// eval からは呼べない。一方、SQL の WHERE 句(is_medical 除外・年齢一致・区市町村一致 or 広域)
// 自体は「検索精度」を評価する上で本質的なロジックであり、eval 側で再実装すると本番の
// SQL とロジックが乖離するリスクがある(本番側だけ変更されて eval が気づかない)。
// そこで `D1Database.prepare().bind().all()` の呼び出し形だけを満たすシムを用意し、実体は
// `eval/lib/d1.ts`(wrangler d1 execute --local 経由)に委譲することで、本番の
// `searchFacilities`/`fetchFacilitiesByIds` をそのまま実行できるようにする。

import type { D1Database, D1PreparedStatement, D1Result } from "@cloudflare/workers-types";

import { queryD1 } from "./d1";

function escapeSqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replace(/'/g, "''")}'`;
}

/** `?` プレースホルダーを、束縛済みの値でそのまま埋め込んだ実行可能 SQL 文字列を組み立てる。 */
function interpolate(sql: string, params: readonly unknown[]): string {
  let i = 0;
  return sql.replace(/\?/g, () => escapeSqlLiteral(params[i++]));
}

class EvalPreparedStatement {
  private readonly sql: string;
  private readonly params: readonly unknown[];

  constructor(sql: string, params: readonly unknown[] = []) {
    this.sql = sql;
    this.params = params;
  }

  bind(...params: unknown[]): EvalPreparedStatement {
    return new EvalPreparedStatement(this.sql, params);
  }

  async all<T = Record<string, unknown>>(): Promise<Pick<D1Result<T>, "results" | "success">> {
    const results = queryD1<T>(interpolate(this.sql, this.params));
    return { results, success: true };
  }
}

/**
 * ローカル D1(wrangler d1 execute --local)を裏側で叩く `D1Database` シムを生成する。
 * `prepare().bind().all()` のみをサポートし、それ以外のメソッド(batch/dump/exec 等)は
 * 本番コードから呼ばれない前提で未実装(呼び出されたら例外)。eval ハーネス専用。
 */
export function createEvalD1(): D1Database {
  const shim = {
    prepare(sql: string): D1PreparedStatement {
      return new EvalPreparedStatement(sql) as unknown as D1PreparedStatement;
    },
  };
  return shim as unknown as D1Database;
}
