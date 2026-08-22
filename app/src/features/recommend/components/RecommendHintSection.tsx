"use client";

import { useEffect, useId, useState } from "react";
import { Lightbulb, Send } from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiThinkingIndicator } from "@/components/common/AiThinkingIndicator";
import { ConditionPill, ConditionPillList } from "@/components/common/ConditionPill";
import { ConsentPreviewBox } from "@/components/common/ConsentPreviewBox";
import { ProvenanceLabel } from "@/components/common/ProvenanceLabel";
import { SingleChoiceButtonGroup } from "@/components/common/SingleChoiceButtonGroup";
import { extractApiErrorCode, resolveAiErrorMessage } from "@/lib/api/ai-error-codes";
import { postJson } from "@/lib/api/post-json";
import { isCurrentLocationEnabled } from "@/features/history/services/settings";
import { MunicipalityCombobox } from "@/features/support/components/MunicipalityCombobox";
import { SupportTagToggleGroup } from "@/features/support/components/SupportTagToggleGroup";
import { findNearestMunicipality } from "@/features/support/constants/municipality-centers";
import { useCurrentLocation } from "@/features/support/hooks/useCurrentLocation";
import { LIFESTAGE_OPTIONS, mapLifestageToAgeGroup } from "@/features/support/services/lifestage-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";

import {
  RECOMMEND_QUERY_MAX_LENGTH,
  RecommendResponseSchema,
} from "@/features/recommend/schema/recommend";
import type { RecommendResponse } from "@/features/recommend/schema/recommend";

interface RecommendHintSectionProps {
  /** 結果画面から引き継いだ相談分野タグ(FR-023)の初期値。ユーザーはフォーム上で編集できる。空配列で送信した場合は「全般」として扱う。 */
  initialTags: SupportTag[];
  /** true の場合は入口ボタンを省略してフォームから表示する。 */
  autoStart?: boolean;
  /** `/support/results` から引き継いだ元の年齢選択(ライフステージ)のプリフィル値(既定 null=未選択)。 */
  initialLifestage?: Lifestage | null;
  /** `/support/results` から引き継いだ区市町村のプリフィル値(既定 null=未入力)。 */
  initialMunicipality?: string | null;
  /** 検索結果へ戻る通常検索の導線。検索結果から来た場合だけ表示する。 */
  resultsHref?: string | null;
}

type Step = "idle" | "form" | "preview" | "sending" | "result" | "error";

const DEFAULT_ERROR_MESSAGE = "相談先のヒントの取得に失敗しました。もう一度お試しください。";

/**
 * 結果画面の「相談先のヒントを見る(任意)」セクション(TICKET-0023)。
 *
 * P1 スコープでは `/support/results` への本格的な RAG レコメンド統合は次チケット以降に回し
 * (ticket 記載)、結果画面からの最小限の入口として、その場で相談内容・年齢・区市町村を
 * 入力して `/api/recommend` を試せる UI のみを提供する。
 * `/support/results` から遷移した場合、年齢・区市町村は `initialLifestage`/`initialMunicipality`
 * でプリフィルされ、ユーザーは再入力せずに済む(相談したい内容の自由記述だけは引き続き入力が必要)。
 * 未指定時は従来どおり空から選択する。年齢は `SupportInputForm` と同じ5区分ライフステージで選択させ、
 * D1 検索用の `AgeGroup` は `mapLifestageToAgeGroup` で導出する。
 *
 * `AiSummarySection`(TICKET-0022)と同じく、明示同意・送信内容プレビューを経たあとにのみ
 * fetch を発行する(FR-041)。「同意して送信」より前に fetch は一切発行しない。
 */
const QUICK_QUERY_OPTIONS = [
  "まず発達について相談したい",
  "園・学校での困りごとを相談したい",
  "利用できる支援を知りたい",
  "医療機関・検査について知りたい",
] as const;

export function RecommendHintSection({
  initialTags,
  autoStart = false,
  initialLifestage = null,
  initialMunicipality = null,
  resultsHref = null,
}: RecommendHintSectionProps) {
  const [step, setStep] = useState<Step>(autoStart ? "form" : "idle");
  const [tags, setTags] = useState<SupportTag[]>(initialTags);
  const [query, setQuery] = useState("");
  const [lifestage, setLifestage] = useState<Lifestage | null>(initialLifestage);
  const ageGroup = lifestage !== null ? mapLifestageToAgeGroup(lifestage) : null;
  const [municipality, setMunicipality] = useState(initialMunicipality ?? "");
  const [result, setResult] = useState<RecommendResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState(DEFAULT_ERROR_MESSAGE);
  const { state: locationState, request } = useCurrentLocation();
  const textareaId = useId();
  const municipalityId = useId();

  const trimmedQuery = query.trim();
  const canPreview = trimmedQuery.length > 0 && lifestage !== null && municipality !== "";
  const lifestageLabel = LIFESTAGE_OPTIONS.find((option) => option.value === lifestage)?.label ?? "";

  useEffect(() => {
    if (step !== "form") return;
    if (isCurrentLocationEnabled()) request();
  }, [step, request]);

  useEffect(() => {
    if (locationState.status !== "granted") return;
    if (municipality !== "") return;
    const nearest = findNearestMunicipality(locationState.coords);
    // The one-shot location result is only a soft prefill; the current value guard
    // above prevents a delayed result from overwriting a manual selection.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nearest) setMunicipality(nearest.municipality);
  }, [locationState, municipality]);

  function toggleTag(tag: SupportTag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function handleOpenForm() {
    setStep("form");
  }

  function handleShowPreview() {
    if (!canPreview) return;
    setStep("preview");
  }

  function handleCancelPreview() {
    setStep("form");
  }

  async function handleConsentAndSend() {
    if (lifestage === null || ageGroup === null) return;
    setStep("sending");
    const result = await postJson(
      "/api/recommend",
      { query: trimmedQuery, age: ageGroup, lifestage, municipality, tags },
      RecommendResponseSchema,
    );

    if (!result.ok) {
      if (result.reason === "http-error") {
        setErrorMessage(resolveAiErrorMessage(extractApiErrorCode(result.errorBody), DEFAULT_ERROR_MESSAGE));
      }
      setStep("error");
      return;
    }

    setResult(result.data);
    setStep("result");
  }

  function handleRetry() {
    setResult(null);
    setStep("form");
  }

  function handleResend() {
    setStep("preview");
  }

  return (
    <section aria-live="polite" className="flex w-full max-w-none flex-col gap-3 text-left">
      {step === "idle" && (
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleOpenForm}>
          <Lightbulb aria-hidden="true" />
          相談先のヒントを見る(任意)
        </Button>
      )}

      {step !== "idle" && (
        <>
          <h2 className="text-base font-semibold text-foreground">相談したいことを選ぶ</h2>
          <p className="text-xs text-muted-foreground">
            選んだ内容または入力した内容を、外部の生成 AI に送信して候補を整理します。これは診断ではなく、相談先を探すための参考情報です。
          </p>
        </>
      )}

      {(step === "form" || step === "preview") && (
        <>
          {resultsHref && step === "form" && (
            <Link href={resultsHref} className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm font-medium text-primary underline underline-offset-2">
              通常の条件検索で、{municipality}の相談先一覧を見る
            </Link>
          )}
          <SingleChoiceButtonGroup
            legend="よくある相談内容から選ぶ"
            legendClassName="text-sm font-medium text-foreground"
            options={QUICK_QUERY_OPTIONS.map((option) => ({ value: option, label: option }))}
            selectedValue={query}
            onSelect={setQuery}
            disabled={step === "preview"}
          />

          <label htmlFor={textareaId} className="text-sm font-medium text-foreground">
            相談したい内容<span aria-hidden="true">を入力する <span className="font-normal text-muted-foreground">(任意)</span></span>
          </label>
          <Textarea
            id={textareaId}
            aria-label="相談したい内容"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            maxLength={RECOMMEND_QUERY_MAX_LENGTH}
            rows={3}
            disabled={step === "preview"}
            placeholder="選択肢に当てはまらない場合に入力してください"
          />

          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium text-foreground">現在の検索条件</p>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="現在の検索条件の詳細">
              <ConditionPill variant="outline" value={lifestageLabel || "年齢未選択"} />
              <ConditionPill variant="outline" value={municipality || "地域未選択"} />
              <ConditionPillList tags={tags} variant="outline" />
            </div>
            <details className="mt-3">
            <summary className="cursor-pointer text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              条件を変更する
            </summary>
            <div className="mt-3 flex flex-col gap-4">
              <SingleChoiceButtonGroup
                legend="相談したい方の年齢"
                options={LIFESTAGE_OPTIONS}
                selectedValue={lifestage}
                onSelect={setLifestage}
                disabled={step === "preview"}
              />

              <div className="flex flex-col gap-2 text-left">
                <label htmlFor={municipalityId} className="text-base font-medium text-foreground">
                  お住まいの区市町村
                </label>
                <MunicipalityCombobox
                  value={municipality}
                  onValueChange={setMunicipality}
                  disabled={step === "preview"}
                  inputId={municipalityId}
                />
                <p className="text-xs text-muted-foreground">例: 新宿区、八王子市</p>
              </div>

              <SupportTagToggleGroup
                legend="困りごとタグ(複数選択可)"
                selectedTags={tags}
                onToggle={toggleTag}
                disabled={step === "preview"}
              />
            </div>
            </details>
          </div>
        </>
      )}

      {step === "form" && (
        <Button type="button" size="lg" className="sticky bottom-3 z-10 w-full shadow-md" disabled={!canPreview} onClick={handleShowPreview}>
          <Send aria-hidden="true" />
          送信内容を確認
        </Button>
      )}

      {step === "preview" && (
        <ConsentPreviewBox
          sent={
            <>
              <p className="text-foreground">相談したい内容: 「{trimmedQuery}」</p>
              <p className="text-foreground">年齢層: {lifestageLabel}</p>
              <p className="text-foreground">区市町村: {municipality}</p>
              <p className="text-foreground">相談分野: {tags.length > 0 ? tags.join("、") : "(なし)"}</p>
            </>
          }
          notSent={<p className="text-foreground">アンケートの回答内容そのもの</p>}
          onConsent={handleConsentAndSend}
          onCancel={handleCancelPreview}
        />
      )}

      {step === "sending" && <AiThinkingIndicator label="相談先のヒントを探しています…" />}

      {step === "result" && result && (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
          {result.fallbackMessage && <p className="text-xs text-muted-foreground">{result.fallbackMessage}</p>}

          {result.facilities.length === 0 && (
            <p className="text-foreground">該当する相談先が見つかりませんでした。</p>
          )}

          <ul className="flex flex-col gap-3">
            {result.facilities.map((facility) => (
              <li key={facility.id} className="rounded-lg border border-border p-3">
                <div className="flex items-center gap-2">
                  <p className="font-medium text-foreground">{facility.name}</p>
                  <ProvenanceLabel source="primary" />
                </div>
                {facility.aiNote && (
                  <div className="mt-1 flex flex-col gap-1">
                    <ProvenanceLabel source="ai" />
                    <p className="text-muted-foreground">{facility.aiNote}</p>
                  </div>
                )}
                {facility.address && <p className="mt-1 text-xs text-muted-foreground">{facility.address}</p>}
                {facility.phone && <p className="text-xs text-muted-foreground">{facility.phone}</p>}
                {facility.url && (
                  <a href={facility.url} className="text-xs text-primary underline" rel="noreferrer" target="_blank">
                    {facility.url}
                  </a>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{facility.sourceCredit}</p>
              </li>
            ))}
          </ul>

          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleResend}>
            同じ内容で再送信
          </Button>
          <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleRetry}>
            もう一度入力する
          </Button>
        </div>
      )}

      {step === "error" && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 p-4 text-sm">
          <p className="text-destructive">{errorMessage}</p>
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleResend}>
            同じ内容で再送信
          </Button>
          <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleRetry}>
            もう一度入力する
          </Button>
        </div>
      )}
    </section>
  );
}
