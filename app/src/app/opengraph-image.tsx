import { ImageResponse } from "next/og";

/**
 * TICKET-0031: 共有導線の入口体験(OGP画像)。
 *
 * `src/app/layout.tsx` の openGraph/twitter からこの規約ファイルが自動的に参照される
 * (App Router の `opengraph-image` 規約)。結果データ(スコア・カテゴリ等)は一切
 * props/引数として受け取らない構成にし、共有 URL(`#r=...`)ごとに内容が変化しないことを
 * コード上明らかにする(TICKET-0031 背景・技術的詳細 §3)。
 *
 * 判断メモ(和文フォントを使わない理由): satori(ImageResponse の内部実装)は日本語グリフの
 * デフォルトフォントを内蔵しておらず、和文を描画するには別途フォントファイルを明示的に
 * `fonts` オプションへ渡す必要がある。本チケットは新規依存パッケージの追加が禁止されており、
 * 外部フォントを都度 fetch する実装はプライバシー方針(NFR-31〜33、サーバー非依存の思想)や
 * オフライン完結の設計とも相性が悪いため採用しない。よって画像内は英数字のみの構成とし、
 * 和文の趣旨説明は `openGraph.title`/`openGraph.description`(layout.tsx)側で担う。
 */
export const alt = "Trait Compass — 発達特性と困りごとを整理し、支援への道しるべに";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "#0f172a",
          color: "#f8fafc",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ fontSize: 64, fontWeight: 700, display: "flex" }}>Trait Compass Self-Check</div>
        <div style={{ fontSize: 28, fontWeight: 400, marginTop: 24, color: "#94a3b8", display: "flex" }}>
          A self-understanding tool, not a diagnosis
        </div>
      </div>
    ),
    { ...size },
  );
}
