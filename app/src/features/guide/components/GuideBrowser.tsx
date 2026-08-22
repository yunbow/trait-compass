"use client";

import { useMemo, useState } from "react";

import { ContentSection } from "@/components/common/ContentSection";

export interface GuideEntry {
  id: string;
  anchorId: string;
  label: string;
  description: string;
}

interface GuideBrowserProps {
  categories: GuideEntry[];
  traits: GuideEntry[];
  confusedTerms: GuideEntry[];
}

type ChipKey = "all" | "categories" | "traits" | "confused";

const CHIPS: { key: ChipKey; label: string }[] = [
  { key: "all", label: "すべて" },
  { key: "categories", label: "困りごとの領域" },
  { key: "traits", label: "発達特性" },
  { key: "confused", label: "よく混同される言葉" },
];

function matches(entry: GuideEntry, query: string): boolean {
  if (!query) return true;
  const normalized = query.toLowerCase();
  return entry.label.toLowerCase().includes(normalized) || entry.description.toLowerCase().includes(normalized);
}

/**
 * 用語の説明(/guide)の検索・絞り込みUI。
 * 領域名10件・発達特性関連4件・よく混同される言葉が今後も増える前提のため、
 * 目次を静的なページ内リンク一覧のまま増やし続けるより、検索+カテゴリチップで
 * 目的の用語へ直接たどり着けるようにする(状態を持つため唯一のクライアント
 * コンポーネントとし、GuideView 側はデータ整形とサーバー側処理に専念する)。
 */
export function GuideBrowser({ categories, traits, confusedTerms }: GuideBrowserProps) {
  const [query, setQuery] = useState("");
  const [activeChip, setActiveChip] = useState<ChipKey>("all");

  const showCategories = activeChip === "all" || activeChip === "categories";
  const showTraits = activeChip === "all" || activeChip === "traits";
  const showConfused = activeChip === "all" || activeChip === "confused";

  const filteredCategories = useMemo(
    () => (showCategories ? categories.filter((entry) => matches(entry, query)) : []),
    [categories, query, showCategories],
  );
  const filteredTraits = useMemo(
    () => (showTraits ? traits.filter((entry) => matches(entry, query)) : []),
    [traits, query, showTraits],
  );
  const filteredConfused = useMemo(
    () => (showConfused ? confusedTerms.filter((entry) => matches(entry, query)) : []),
    [confusedTerms, query, showConfused],
  );

  const hasAnyResult = filteredCategories.length > 0 || filteredTraits.length > 0 || filteredConfused.length > 0;
  const resultCount = filteredCategories.length + filteredTraits.length + filteredConfused.length;
  const hasActiveFilter = query.length > 0 || activeChip !== "all";

  function resetFilters(): void {
    setQuery("");
    setActiveChip("all");
  }

  return (
    <div className="flex flex-col gap-6">
      <ContentSection anchorId="guide-search-section" title="用語を探す">
        <p className="mt-1 text-sm text-muted-foreground">結果に出た言葉や、制度・相談先で見かけた言葉を入力してください。</p>
        <label htmlFor="guide-search" className="sr-only">用語を検索</label>
        <input
          id="guide-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="例: 受給者証"
          className="mt-2 h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
        <div className="mt-3 flex flex-wrap gap-2">
          {CHIPS.map((chip) => (
            <button
              key={chip.key}
              type="button"
              aria-pressed={activeChip === chip.key}
              onClick={() => setActiveChip(chip.key)}
              className={`rounded-full border px-3 py-1.5 text-sm focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50 ${
                activeChip === chip.key
                  ? "border-primary bg-primary/10 font-medium text-primary"
                  : "border-border bg-background text-foreground hover:bg-muted"
              }`}
            >
              {chip.label}
            </button>
          ))}
        </div>
        <div className="mt-3 flex items-center justify-between gap-3 text-sm text-muted-foreground" aria-live="polite">
          <p>{hasAnyResult ? `${resultCount}件の用語が見つかりました。` : "一致する用語はありません。"}</p>
          {hasActiveFilter && (
            <button type="button" onClick={resetFilters} className="shrink-0 underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              条件をリセット
            </button>
          )}
        </div>
      </ContentSection>

      {!hasAnyResult && (
        <p className="rounded-lg border border-border bg-card p-4 text-sm text-muted-foreground">
          「{query}」に一致する用語が見つかりませんでした。検索語を変えるか、カテゴリを「すべて」にしてお試しください。
        </p>
      )}

      {filteredCategories.length > 0 && (
        <section id="categories" className="scroll-mt-6">
          <h2 className="text-xl font-semibold text-foreground">困りごとの領域</h2>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredCategories.map((entry) => (
              <article key={entry.id} id={entry.anchorId} className="scroll-mt-6 rounded-lg border border-border bg-card p-4">
                <h3 className="text-base font-semibold text-foreground">{entry.label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {filteredTraits.length > 0 && (
        <section id="traits" className="scroll-mt-6">
          <h2 className="text-xl font-semibold text-foreground">発達特性に関連する用語</h2>
          <p className="mt-2 rounded-lg border border-primary/20 bg-primary/5 px-3 py-2 text-sm leading-6 text-muted-foreground">
            Trait Compass では診断名を判断せず、日常の困りごとや特徴を整理するための参考として用語を扱います。
          </p>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {filteredTraits.map((entry) => (
              <article key={entry.id} id={entry.anchorId} className="scroll-mt-6 rounded-lg border border-border bg-card p-4">
                <h3 className="text-base font-semibold text-foreground">{entry.label}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}

      {filteredConfused.length > 0 && (
        <section id="confused-terms" className="scroll-mt-6">
          <h2 className="text-xl font-semibold text-foreground">よく混同される言葉</h2>
          <p className="mt-2 text-sm leading-6 text-muted-foreground">
            支援制度や相談窓口を調べるときによく混同されがちな言葉を、一般的な違いとして整理しています。個別の手続きの詳細は、お住まいの自治体窓口にご確認ください。
          </p>
          <div className="mt-4 flex flex-col gap-3">
            {filteredConfused.map((entry) => (
              <details key={entry.id} id={entry.anchorId} className="scroll-mt-6 rounded-lg border border-border bg-card p-4">
                <summary className="cursor-pointer text-base font-semibold text-foreground">
                  {entry.label}
                  <span className="ml-2 text-sm font-normal text-muted-foreground">違いを確認する</span>
                </summary>
                <p className="mt-3 border-t border-border pt-3 text-sm leading-6 text-muted-foreground">{entry.description}</p>
              </details>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
