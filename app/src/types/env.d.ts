// Cloudflare バインディングの型定義。
// `@opennextjs/cloudflare` は `declare global { interface CloudflareEnv { ... } }` で
// ASSETS 等の共通バインディングを宣言しているため、本ファイルではアプリ固有のバインディング
// (D1 の `DB`)を宣言マージ(declaration merging)で追加する。
//
// D1Database の型は `@cloudflare/workers-types` から named import する(default import や
// `/// <reference types="@cloudflare/workers-types" />` は使わない)。理由: この型は
// Response/Request/fetch 等のグローバル DOM 型も再定義しており、Next.js アプリの
// `lib: ["dom", ...]` と衝突するため、必要な型のみを個別 import するに留める。
//
// 参考: node_modules/@opennextjs/cloudflare/dist/api/cloudflare-context.d.ts
import type { Ai, D1Database, Vectorize } from "@cloudflare/workers-types";

declare global {
  interface CloudflareEnv {
    /**
     * 支援窓口データ(datasets/facilities/facility_tags)を保持する D1 バインディング。
     * `wrangler.toml` の `[[d1_databases]]`(binding = "DB")に対応する。
     * ローカルは wrangler/Miniflare のローカル SQLite(`.wrangler/state`)、
     * 本番は Cloudflare D1 の同一バインディングにアクセスする。
     */
    DB: D1Database;

    /**
     * 埋め込み(`@cf/baai/bge-m3`)生成用の Workers AI バインディング(型のみ先行定義)。
     * `src/lib/ai/providers/workers-ai-embedder.ts` が本番/`wrangler dev` 上でのみ利用する。
     * ローカルの `next dev` は `EMBEDDER_PROVIDER=ollama`(既定)で `OllamaEmbedder` を使うため
     * このバインディングは不要。`wrangler.toml` への実バインディング追加(`[ai]` セクション)は
     * TICKET-0021 以降で行う(本チケットでは型のみ)。
     * 参考: docs/designs/architecture-for-engineers.md §4(AIプロバイダ抽象化)
     */
    AI?: Ai;

    /**
     * RAG 用ベクトル検索の Vectorize バインディング(型のみ先行定義)。
     * `src/lib/ai/providers/vectorize-vector-store.ts` が本番/`wrangler dev` 上でのみ利用する。
     * ローカルの `next dev` は `VECTOR_PROVIDER=qdrant`(既定)で `QdrantVectorStore` を使うため
     * このバインディングは不要。`wrangler.toml` への実バインディング追加(`[[vectorize]]` セクション)は
     * TICKET-0022 以降で行う(本チケットでは型のみ)。
     * 参考: docs/designs/architecture-for-engineers.md §4(AIプロバイダ抽象化)
     */
    VECTORIZE?: Vectorize;
  }
}

export {};
