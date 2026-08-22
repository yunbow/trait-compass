// 埋め込みクエリテキストの組み立て(TICKET-0023, FR-042)。
//
// ユーザーの自由文(相談したい内容)に、選択済みの相談分野タグ(TICKET-0013, FR-023)を
// 補助情報として付加し、VectorStore 検索の精度を上げる。純関数なので D1/Embedder 抜きで
// テストできる(NFR-72)。

import type { SupportTag } from "@/features/support/services/category-tag-mapping";

/**
 * `Embedder.embed` に渡すクエリテキストを組み立てる。
 * タグが1つも無い場合(「全般」)は自由文のみを返す。
 */
export function buildEmbeddingQueryText(query: string, tags: readonly SupportTag[]): string {
  if (tags.length === 0) return query;
  return `${query}\n(相談分野: ${tags.join("、")})`;
}
