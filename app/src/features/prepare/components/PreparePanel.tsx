"use client";

import { useId, useState } from "react";
import { ChevronDown, NotebookPen, Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { AiThinkingIndicator } from "@/components/common/AiThinkingIndicator";
import { ConditionPill, ConditionPillList } from "@/components/common/ConditionPill";
import { SingleChoiceButtonGroup } from "@/components/common/SingleChoiceButtonGroup";
import { TagToggleGroup } from "@/components/common/TagToggleGroup";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import type { CategoryKey } from "@/features/survey/schema/question";
import { MunicipalityCombobox } from "@/features/support/components/MunicipalityCombobox";
import { SupportTagToggleGroup } from "@/features/support/components/SupportTagToggleGroup";
import { NextActionFeedbackSection } from "@/features/feedback/components/NextActionFeedbackSection";
import { LIFESTAGE_OPTIONS, mapLifestageToAgeGroup } from "@/features/support/services/lifestage-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import { SUPPORT_TAGS } from "@/features/support/services/category-tag-mapping";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import { postJson } from "@/lib/api/post-json";

import { PrepareMemo } from "@/features/prepare/components/PrepareMemo";
import { PREPARE_RELATIONSHIP_OPTIONS, PrepareResponseSchema } from "@/features/prepare/schema/prepare";
import type { PrepareRelationship, PrepareResponse } from "@/features/prepare/schema/prepare";
import {
  PREPARE_ACCOMMODATION_TAGS,
  PREPARE_CONSULT_PURPOSE_OPTIONS,
  PREPARE_CONTACT_METHOD_OPTIONS,
  PREPARE_DURATION_OPTIONS,
  PREPARE_LIFE_STATUS_OPTIONS,
  PREPARE_PRIOR_SUPPORT_TAGS,
  PREPARE_SITUATION_TAGS,
} from "@/features/prepare/constants/prepare-options";
import type {
  PrepareAccommodationTag,
  PrepareConsultPurpose,
  PrepareContactMethod,
  PrepareDuration,
  PrepareLifeStatus,
  PrepareSituationTag,
  PriorSupportTag,
} from "@/features/prepare/constants/prepare-options";

interface PreparePanelProps {
  /** 結果画面の上位カテゴリ(AiSummarySection と同じ、最大3件)。 */
  topCategories: CategoryKey[];
  /** 結果画面から引き継いだ相談分野タグ(FR-023)。フォームの初期選択に使う。 */
  initialTags: SupportTag[];
  /** true の場合は入口ボタンを省略してフォームから表示する。 */
  autoStart?: boolean;
  /** `/support/results` から引き継いだ元の年齢選択(ライフステージ)のプリフィル値(既定 null=未選択)。 */
  initialLifestage?: Lifestage | null;
  /** `/support/results` から引き継いだ区市町村のプリフィル値(既定 null=未入力)。 */
  initialMunicipality?: string | null;
}

type Step = "idle" | "form" | "preview" | "sending" | "result" | "error";

/**
 * 「相談の準備をする」タブの本体(TICKET-0046)。
 *
 * `AiSummarySection`/`RecommendHintSection` と同じく、選択式フォーム → 送信内容プレビュー →
 * 明示同意("同意して送信")を経たあとにのみ `/api/prepare` へ fetch する(FR-041)。
 * **自由記述入力欄は一切設けない**(AC-2、既存の危機介入回避構造の維持)。
 * `/support/results` から遷移した場合、年齢・区市町村は `initialLifestage`/`initialMunicipality`
 * でプリフィルされ、ユーザーは再入力せずに済む(未指定時は従来どおり空から選択する)。
 * 年齢は `SupportInputForm` と同じ5区分ライフステージで選択させ、D1 検索用の `AgeGroup` は
 * `mapLifestageToAgeGroup` で導出する(表示・送信はlifestage優先、D1検索用age_rangeとは使い分けている)。
 */
export function PreparePanel({ topCategories, initialTags, autoStart = false, initialLifestage = null, initialMunicipality = null }: PreparePanelProps) {
  const [step, setStep] = useState<Step>(autoStart ? "form" : "idle");
  const [tags, setTags] = useState<SupportTag[]>(initialTags);
  const [lifestage, setLifestage] = useState<Lifestage | null>(initialLifestage);
  const ageGroup = lifestage !== null ? mapLifestageToAgeGroup(lifestage) : null;
  const [municipality, setMunicipality] = useState(initialMunicipality ?? "");
  // TICKET-0047: 「本人として相談する/保護者として相談する」の選択(既定は "self")。
  // 年齢から相談する立場を推測しない。未成年の本人利用もあるため、従来どおり本人を既定とし、
  // 保護者として相談する場合のみユーザー自身が切り替える。
  const [relationship, setRelationship] = useState<PrepareRelationship>("self");
  // 相談メモ追加項目(選択式7フィールド、Phase 2)。すべて任意項目(canPreview に影響しない)。
  const [situations, setSituations] = useState<PrepareSituationTag[]>([]);
  const [duration, setDuration] = useState<PrepareDuration | undefined>(undefined);
  const [lifeStatus, setLifeStatus] = useState<PrepareLifeStatus | undefined>(undefined);
  const [consultPurpose, setConsultPurpose] = useState<PrepareConsultPurpose | undefined>(undefined);
  const [contactMethod, setContactMethod] = useState<PrepareContactMethod | undefined>(undefined);
  const [accommodations, setAccommodations] = useState<PrepareAccommodationTag[]>([]);
  const [priorSupport, setPriorSupport] = useState<PriorSupportTag[]>([]);
  const [memo, setMemo] = useState<PrepareResponse | null>(null);
  const [isBasicInfoOpen, setIsBasicInfoOpen] = useState(initialLifestage === null || initialMunicipality === null);
  const [isOptionalDetailsOpen, setIsOptionalDetailsOpen] = useState(false);
  const municipalityId = useId();

  const canPreview = lifestage !== null && municipality !== "";
  const topCategoryLabels = topCategories.map((key) => CATEGORY_LABELS[key]);
  const lifestageLabel = LIFESTAGE_OPTIONS.find((option) => option.value === lifestage)?.label ?? "";
  const relationshipLabel = PREPARE_RELATIONSHIP_OPTIONS.find((option) => option.value === relationship)?.label ?? "";
  const durationLabel = PREPARE_DURATION_OPTIONS.find((option) => option.value === duration)?.label ?? "(なし)";
  const lifeStatusLabel = PREPARE_LIFE_STATUS_OPTIONS.find((option) => option.value === lifeStatus)?.label ?? "(なし)";
  const consultPurposeLabel =
    PREPARE_CONSULT_PURPOSE_OPTIONS.find((option) => option.value === consultPurpose)?.label ?? "(なし)";
  const contactMethodLabel =
    PREPARE_CONTACT_METHOD_OPTIONS.find((option) => option.value === contactMethod)?.label ?? "(なし)";
  const optionalSelectionCount =
    situations.length + accommodations.length + priorSupport.length + [duration, lifeStatus, consultPurpose, contactMethod].filter(Boolean).length;

  function toggleTag(tag: SupportTag) {
    setTags((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function toggleSituation(tag: PrepareSituationTag) {
    setSituations((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function toggleAccommodation(tag: PrepareAccommodationTag) {
    setAccommodations((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
  }

  function togglePriorSupport(tag: PriorSupportTag) {
    setPriorSupport((prev) => (prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]));
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
      "/api/prepare",
      {
        topCategories,
        tags,
        age: ageGroup,
        lifestage,
        municipality,
        relationship,
        situations,
        duration,
        lifeStatus,
        consultPurpose,
        contactMethod,
        accommodations,
        priorSupport,
      },
      PrepareResponseSchema,
    );

    if (!result.ok) {
      setStep("error");
      return;
    }

    setMemo(result.data);
    setStep("result");
  }

  function handleRetry() {
    setMemo(null);
    setStep("form");
  }

  function handleResend() {
    setStep("preview");
  }

  return (
    <section aria-live="polite" className="flex w-full flex-col gap-3 text-left">
      {step === "idle" && (
        <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleOpenForm}>
          <NotebookPen aria-hidden="true" />
          相談メモを作る(任意)
        </Button>
      )}

      {step !== "idle" && step !== "result" && (
        <>
          <h2 className="text-base font-semibold text-foreground">1. 基本情報</h2>
          <p className="text-xs text-muted-foreground">
            年齢と地域は必須です。外部の生成AIは使わず、選んだ項目だけから相談メモの下書きを作ります。自由記述の入力欄はありません。
            <a className="ml-1 underline underline-offset-2" href="#privacy-note">送信内容とプライバシー</a>
          </p>
        </>
      )}

      {(step === "form" || step === "preview") && (
        <>
          {topCategoryLabels.length > 0 && (
            <div className="flex flex-col gap-1">
              <span className="text-xs font-medium text-foreground">チェックから引き継いだ傾向</span>
              <p className="text-sm text-foreground">{topCategoryLabels.join("、")}</p>
            </div>
          )}

          <div className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-xs font-medium text-foreground">基本情報 <span className="text-destructive">（年齢・地域は必須）</span></p>
            <div className="mt-2 flex flex-wrap gap-2" aria-label="現在の基本情報">
              <ConditionPill variant="outline" value={lifestageLabel || "年齢未選択"} />
              <ConditionPill variant="outline" value={municipality || "地域未選択"} />
              <ConditionPillList tags={tags} variant="outline" />
            </div>
          <details className="group mt-3" open={isBasicInfoOpen} onToggle={(event) => setIsBasicInfoOpen(event.currentTarget.open)}>
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
              <span>基本情報を入力・変更</span>
              <ChevronDown aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
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
              {tags.length < SUPPORT_TAGS.length && (
                <p className="text-xs text-muted-foreground">他の困りごとタグも選べます。</p>
              )}
            </div>
          </details>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-sm font-medium text-foreground">どなたについて相談しますか？ <span className="font-normal text-muted-foreground">（任意）</span></p>
            <SingleChoiceButtonGroup
              legend="どなたについて相談しますか？"
              legendClassName="sr-only"
              options={PREPARE_RELATIONSHIP_OPTIONS}
              selectedValue={relationship}
              onSelect={setRelationship}
              disabled={step === "preview"}
            />
          </div>

          <h2 className="text-base font-semibold text-foreground">2. 相談内容を選ぶ</h2>
          <p className="text-xs text-muted-foreground">あてはまるものだけ選んでください。すべて任意です。</p>
          <TagToggleGroup legend="困っている場面(複数選択可)" options={PREPARE_SITUATION_TAGS} selectedTags={situations} onToggle={toggleSituation} disabled={step === "preview"} />
          <SingleChoiceButtonGroup legend="相談したい内容" options={PREPARE_CONSULT_PURPOSE_OPTIONS} selectedValue={consultPurpose} onSelect={setConsultPurpose} disabled={step === "preview"} />
          <SingleChoiceButtonGroup legend="希望する連絡方法" options={PREPARE_CONTACT_METHOD_OPTIONS} selectedValue={contactMethod} onSelect={setContactMethod} disabled={step === "preview"} />

          <details
            className="rounded-lg border border-border bg-muted/40 p-4"
            open={step === "preview" || isOptionalDetailsOpen}
            onToggle={(event) => setIsOptionalDetailsOpen(event.currentTarget.open)}
          >
            <summary className="cursor-pointer text-sm font-semibold text-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50">3. 詳しい状況を追加する <span className="font-normal text-muted-foreground">（任意・{optionalSelectionCount}項目選択済み）</span></summary>
            <p className="mt-2 text-xs text-muted-foreground">選ばなくてもメモを作成できます。</p>
            <div className="mt-4 flex flex-col gap-5">
              <SingleChoiceButtonGroup legend="いつから困っているか" options={PREPARE_DURATION_OPTIONS} selectedValue={duration} onSelect={setDuration} disabled={step === "preview"} />
              <SingleChoiceButtonGroup legend="現在の生活・就労・就学状況" options={PREPARE_LIFE_STATUS_OPTIONS} selectedValue={lifeStatus} onSelect={setLifeStatus} disabled={step === "preview"} />
              <TagToggleGroup legend="相談時に配慮してほしいこと(複数選択可)" options={PREPARE_ACCOMMODATION_TAGS} selectedTags={accommodations} onToggle={toggleAccommodation} disabled={step === "preview"} />
              <TagToggleGroup legend="これまで利用した支援(複数選択可)" options={PREPARE_PRIOR_SUPPORT_TAGS} selectedTags={priorSupport} onToggle={togglePriorSupport} disabled={step === "preview"} />
            </div>
          </details>
        </>
      )}

      {step === "form" && (
        <div className="sticky bottom-3 z-10 flex flex-col gap-1 rounded-lg bg-background/95 pt-2 shadow-md">
          {!canPreview && <p className="px-1 text-xs text-muted-foreground">年齢と地域を入力すると、送信内容を確認できます。</p>}
          <Button type="button" size="lg" className="w-full" disabled={!canPreview} onClick={handleShowPreview}>
            <Send aria-hidden="true" />
            送信内容を確認
          </Button>
        </div>
      )}

      {step === "preview" && (
        <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 text-sm">
          <p className="font-semibold text-foreground">送信内容を確認してください。</p>

          <div className="flex flex-col gap-3">
            <div className="rounded-md bg-muted/50 p-3">
              <p className="text-xs font-medium text-muted-foreground">基本情報</p>
              <p className="mt-1 text-foreground">相談の対象: {relationshipLabel}</p>
              <p className="text-foreground">年齢層: {lifestageLabel}</p>
              <p className="text-foreground">区市町村: {municipality}</p>
            </div>
            {(topCategoryLabels.length > 0 || tags.length > 0 || optionalSelectionCount > 0) && (
              <div className="rounded-md bg-muted/50 p-3">
                <p className="text-xs font-medium text-muted-foreground">相談内容</p>
                {topCategoryLabels.length > 0 && <p className="mt-1 text-foreground">チェックで高めだった領域: {topCategoryLabels.join("、")}</p>}
                {tags.length > 0 && <p className="text-foreground">困りごとタグ: {tags.join("、")}</p>}
                {situations.length > 0 && <p className="text-foreground">困っている場面: {situations.join("、")}</p>}
                {consultPurpose && <p className="text-foreground">相談したい内容: {consultPurposeLabel}</p>}
                {contactMethod && <p className="text-foreground">希望する連絡方法: {contactMethodLabel}</p>}
                {duration && <p className="text-foreground">いつから困っているか: {durationLabel}</p>}
                {lifeStatus && <p className="text-foreground">現在の生活・就労・就学状況: {lifeStatusLabel}</p>}
                {accommodations.length > 0 && <p className="text-foreground">相談時に配慮してほしいこと: {accommodations.join("、")}</p>}
                {priorSupport.length > 0 && <p className="text-foreground">これまで利用した支援: {priorSupport.join("、")}</p>}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground">送信されないもの</p>
            <p className="text-foreground">アンケートの回答内容そのもの・自由記述</p>
          </div>

          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              「メモを作成する」を押すと、上記の選択項目をもとに相談メモを作成します。外部の生成AIは使用しません。区市町村は、近くの相談窓口を探すためだけに使用します。
            </p>
            <Button type="button" size="lg" className="w-full" onClick={handleConsentAndSend}>
              <NotebookPen aria-hidden="true" />
              メモを作成する
            </Button>
            <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleCancelPreview}>
              キャンセル
            </Button>
          </div>
        </div>
      )}

      {step === "sending" && <AiThinkingIndicator label="相談メモを作成しています…" />}

      {step === "result" && memo && (
        <>
          <PrepareMemo memo={memo} />
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleResend}>
            同じ内容で再送信
          </Button>
          <Button type="button" variant="ghost" size="lg" className="w-full print:hidden" onClick={handleRetry}>
            もう一度選び直す
          </Button>
          <NextActionFeedbackSection source="result-prepare" />
        </>
      )}

      {step === "error" && (
        <div className="flex flex-col gap-3 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-sm">
          <p className="text-destructive">相談メモの取得に失敗しました。もう一度お試しください。</p>
          <Button type="button" variant="outline" size="lg" className="w-full" onClick={handleResend}>
            同じ内容で再送信
          </Button>
          <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleRetry}>
            もう一度選び直す
          </Button>
        </div>
      )}
      <p id="privacy-note" className="text-xs leading-relaxed text-muted-foreground">
        選択した項目を外部の生成AIに送信することはありません。区市町村は、近くの相談窓口を探すためにこのサービス内のデータベースを検索する目的にのみ使用します。
      </p>
    </section>
  );
}
