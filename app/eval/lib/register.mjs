// eval/lib/ts-loader.mjs(@/ エイリアス・拡張子省略 import の解決フック)を登録するブートストラップ。
//
// 使い方:
//   - エントリポイント自身が `@/...` を import する場合: `node --import ./eval/lib/register.mjs <entry>.ts`
//   - エントリポイント(.mjs)が自分で register 呼び出し後に動的 import する場合
//     (eval/run-all.mjs のパターン): `import "./lib/register.mjs";` の後に `await import("./foo.eval.ts")`
//
// `register()` は「これ以降に解決されるモジュール」にのみフックを適用するため、
// 呼び出し元自身が静的 import で `@/...` を読み込むことはできない(その場合は `--import` 経由で
// エントリポイントより前にこのファイルを読み込む必要がある)。

import { register } from "node:module";

register("./ts-loader.mjs", import.meta.url);
