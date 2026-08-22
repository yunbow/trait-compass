"use client";

import { buildRadarAriaLabel, type RadarDatum } from "@/features/result/services/chart-data";

interface RadarChartProps {
  data: readonly RadarDatum[];
}

// viewBox は日本語カテゴリラベル(最長で10文字程度)が横に長く伸びても
// クリップされないよう、チャート本体(MAX_R)より十分大きめに取っている。
const SIZE = 520;
const CENTER = SIZE / 2;
const MAX_R = 150;
const LABEL_R = MAX_R + 22;
const RINGS = [25, 50, 75, 100];
// 未算出カテゴリの頂点を描く固定半径(実データと混同しないよう、常に中心寄りの小さな位置に置く)。
const UNAVAILABLE_MARKER_R = 10;
const LABEL_LINE_HEIGHT = 13;

function angleFor(index: number, total: number): number {
  return -Math.PI / 2 + (2 * Math.PI * index) / total;
}

function pointAt(index: number, total: number, radius: number): { x: number; y: number } {
  const angle = angleFor(index, total);
  return {
    x: CENTER + radius * Math.cos(angle),
    y: CENTER + radius * Math.sin(angle),
  };
}

function labelAnchor(index: number, total: number): "start" | "end" | "middle" {
  const cos = Math.cos(angleFor(index, total));
  if (cos > 0.15) return "start";
  if (cos < -0.15) return "end";
  return "middle";
}

/**
 * カテゴリラベルを短い行に分割する(SVG の viewBox からのはみ出し・クリップを防ぐため)。
 * 「・」を含む場合はそこで改行し、含まない場合も5文字以上なら半分程度で改行する。
 */
function splitLabelLines(label: string): string[] {
  if (label.includes("・")) {
    return label.split("・");
  }
  if (label.length >= 5) {
    const mid = Math.ceil(label.length / 2);
    return [label.slice(0, mid), label.slice(mid)];
  }
  return [label];
}

/**
 * 10カテゴリのレーダーチャート(TICKET-0008 AC-1)。
 * 依存削減・reduced-motion 制御のしやすさのため Chart.js は使わず SVG 手描きで実装する。
 *
 * `score` が `null`(未算出)のカテゴリは、他カテゴリと同列の数値(0点)としては描画せず、
 * データ多角形からは除外したうえで、軸を破線・頂点をグレーの丸印にして区別する(AC-2)。
 * 重量コンポーネントのため呼び出し側で `next/dynamic({ ssr: false })` に載せる想定。
 */
export default function RadarChart({ data }: RadarChartProps) {
  const total = data.length;
  const availableIndexes = data
    .map((datum, index) => ({ datum, index }))
    .filter(({ datum }) => !datum.isUnavailable);

  const polygonPoints = availableIndexes
    .map(({ datum, index }) => {
      const p = pointAt(index, total, MAX_R * ((datum.score ?? 0) / 100));
      return `${p.x},${p.y}`;
    })
    .join(" ");

  const hasUnavailable = data.some((d) => d.isUnavailable);

  return (
    <figure className="nd-fade-in flex w-full flex-col items-center gap-2">
      <svg
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        width="100%"
        role="img"
        aria-label={buildRadarAriaLabel(data)}
        className="h-auto w-full max-w-[34rem]"
      >
        {/* グリッド(同心円) */}
        {RINGS.map((ring) => (
          <circle
            key={ring}
            cx={CENTER}
            cy={CENTER}
            r={MAX_R * (ring / 100)}
            fill="none"
            stroke="var(--border)"
            strokeWidth={1}
          />
        ))}

        {/* 軸線(未算出カテゴリは破線・グレーで区別) */}
        {data.map((datum, index) => {
          const outer = pointAt(index, total, MAX_R);
          return (
            <line
              key={datum.category}
              x1={CENTER}
              y1={CENTER}
              x2={outer.x}
              y2={outer.y}
              stroke={datum.isUnavailable ? "var(--muted-foreground)" : "var(--border)"}
              strokeWidth={1}
              strokeDasharray={datum.isUnavailable ? "3 3" : undefined}
            />
          );
        })}

        {/* データ多角形: 未算出カテゴリの頂点は含めない(AC-2) */}
        {polygonPoints.length > 0 && (
          <polygon points={polygonPoints} fill="var(--chart-1)" fillOpacity={0.28} stroke="var(--chart-1)" strokeWidth={2} />
        )}

        {/* 頂点(算出済みは塗りつぶし丸、未算出はグレーの破線丸で「未算出」を明示) */}
        {data.map((datum, index) => {
          if (datum.isUnavailable) {
            const p = pointAt(index, total, UNAVAILABLE_MARKER_R);
            return (
              <circle
                key={datum.category}
                cx={p.x}
                cy={p.y}
                r={5}
                fill="var(--muted)"
                stroke="var(--muted-foreground)"
                strokeWidth={1.5}
                strokeDasharray="2 2"
              />
            );
          }
          const p = pointAt(index, total, MAX_R * ((datum.score ?? 0) / 100));
          return <circle key={datum.category} cx={p.x} cy={p.y} r={4} fill="var(--chart-1)" />;
        })}

        {/* カテゴリラベル(長いラベルは複数行に分割し、viewBox からのはみ出しを防ぐ) */}
        {data.map((datum, index) => {
          const p = pointAt(index, total, LABEL_R);
          const lines = splitLabelLines(datum.label);
          const allLines = datum.isUnavailable ? [...lines, "(未算出)"] : lines;
          const startDy = -((allLines.length - 1) * LABEL_LINE_HEIGHT) / 2;
          return (
            <a key={datum.category} href={`/guide#category-${datum.category}`} aria-label={`${datum.label}の用語説明を見る`}>
              <text
                x={p.x}
                y={p.y}
                textAnchor={labelAnchor(index, total)}
                fontSize={11}
                fill={datum.isUnavailable ? "var(--muted-foreground)" : "var(--foreground)"}
                className="cursor-pointer underline-offset-2 hover:underline"
              >
                {allLines.map((line, lineIndex) => (
                  <tspan key={line} x={p.x} dy={lineIndex === 0 ? startDy : LABEL_LINE_HEIGHT}>
                    {line}
                  </tspan>
                ))}
              </text>
            </a>
          );
        })}
      </svg>

      <figcaption className="text-xs text-muted-foreground">
        {hasUnavailable
          ? "※ グレーの破線・丸印は「未算出」(その領域の回答が0件)であることを示します。"
          : "※ 各カテゴリの回答傾向をもとにした目安です。"}
      </figcaption>
    </figure>
  );
}
