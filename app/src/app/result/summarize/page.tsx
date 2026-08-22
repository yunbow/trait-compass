import { redirect } from "next/navigation";

/**
 * 旧・専用ページ(/result/summarize)。
 *
 * 「AIで困りごとを要約する」は `/result/prepare` の「自由記述をAIで整理してメモを作る」
 * モードに統合された(相談メモ作成の入口を1つにまとめる再設計)。過去のブックマーク・共有
 * リンクが404にならないよう、ルート自体は残しつつ `/result/prepare?mode=ai` へリダイレクト
 * するだけのページにする(`/api/summarize` や危機介入ガード等のバックエンド挙動は変更しない)。
 */
export default function ResultSummarizePage() {
  redirect("/result/prepare?mode=ai");
}
