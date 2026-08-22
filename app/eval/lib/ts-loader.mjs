// Node ESM ローダー(resolve hook)。eval/ ハーネスが `src/**` の既存ロジックを
// バンドラなしでそのまま import できるようにするための薄い橋渡し。
//
// なぜ必要か: Node 24 はネイティブに `.ts` の型ストリッピング実行に対応した(型注釈を
// 取り除くだけ、パスエイリアス解決はしない)。一方このリポジトリのソースは
// tsconfig.json の `paths`(`@/*` → `src/*`)と、拡張子省略の相対 import
// (例: `from "../vector-store"`)を前提にしており、これは webpack/Next/vite などの
// バンドラ・vitest(esbuild)側の機能であって Node 単体では解決できない。
//
// このローダーは
//   1. `@/foo/bar` を `<repoRoot>/src/foo/bar` に書き換える
//   2. 拡張子が省略された相対 import に `.ts`/`.tsx`/`/index.ts` を補完する
// の2点のみを行い、それ以外(npm パッケージ・node: 組み込み等)は素通しする。
// 型チェック自体は行わない(`npm run type-check` が別途 tsc で担保する)。

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

// eval/lib/ts-loader.mjs から2階層上(eval/lib → eval → repo root)。
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const SRC_ROOT = path.join(REPO_ROOT, "src");

const CANDIDATE_EXTENSIONS = [".ts", ".tsx", ".mts", "/index.ts", "/index.tsx"];

function existsAsFile(filePath) {
  return existsSync(filePath) && statSync(filePath).isFile();
}

/** 拡張子付きで存在すればその URL を、なければ候補拡張子を順に試して見つかった URL を返す。見つからなければ null。 */
function resolveWithExtensions(absPathNoExt) {
  if (existsAsFile(absPathNoExt)) return absPathNoExt;
  for (const ext of CANDIDATE_EXTENSIONS) {
    const candidate = absPathNoExt + ext;
    if (existsAsFile(candidate)) return candidate;
  }
  return null;
}

export async function resolve(specifier, context, nextResolve) {
  // 1. `@/` エイリアス(tsconfig.json の paths と同じ規約)。
  if (specifier.startsWith("@/")) {
    const absNoExt = path.join(SRC_ROOT, specifier.slice(2));
    const resolved = resolveWithExtensions(absNoExt);
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
    // 見つからない場合はそのまま次に渡し、Node 標準のエラーメッセージに委ねる。
    return nextResolve(specifier, context);
  }

  // 2. 拡張子省略の相対 import(`./foo`, `../foo`)。すでに拡張子が付いている場合は素通し。
  const isRelative = specifier.startsWith("./") || specifier.startsWith("../");
  const hasExtension = /\.[a-zA-Z0-9]+$/.test(specifier);
  if (isRelative && !hasExtension && context.parentURL) {
    const parentPath = fileURLToPath(context.parentURL);
    const absNoExt = path.resolve(path.dirname(parentPath), specifier);
    const resolved = resolveWithExtensions(absNoExt);
    if (resolved) {
      return nextResolve(pathToFileURL(resolved).href, context);
    }
  }

  // 3. それ以外(npm パッケージ、node: 組み込み、拡張子付き import 等)は素通し。
  return nextResolve(specifier, context);
}

// Node の ESM ローダーは `.json` を import する際に `with { type: "json" }` の import attribute を
// 要求する(`validateAttributes`、`ERR_IMPORT_ATTRIBUTE_MISSING`)。TypeScript の
// `moduleResolution: "bundler"` は import attribute なしの JSON import を許容しており、本リポジトリの
// ソース(例: `src/features/support/constants/municipality-registry.ts` の
// `@/data/available-municipality-codes.json` import)もこの前提で書かれている。バンドラ/vitest
// (esbuild)はこの差異を吸収してくれるが、Node 単体では吸収されない。
// `resolve` フック側で `importAttributes` を補う方法は(defaultLoad の attribute 検証タイミングの
// 都合上)効かなかったため、`.json` の読み込みそのものをこの `load` フックで肩代わりし、
// `defaultLoad`(および attribute 検証)を経由させないことで回避する。
export async function load(url, context, nextLoad) {
  if (url.endsWith(".json") && url.startsWith("file://")) {
    const source = readFileSync(fileURLToPath(url), "utf8");
    return { format: "json", source, shortCircuit: true };
  }
  return nextLoad(url, context);
}
