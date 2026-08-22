"use client";

import { useId, useState } from "react";
import { Send, Sparkles } from "lucide-react";

import { useRouter } from "next/navigation";

import { ConditionPill, ConditionPillList } from "@/components/common/ConditionPill";
import { GhostBackLink } from "@/components/common/GhostBackLink";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AiThinkingIndicator } from "@/components/common/AiThinkingIndicator";
import { ProvenanceLabel } from "@/components/common/ProvenanceLabel";
import { AI_DISABLED_MESSAGE, extractApiErrorCode, resolveAiErrorMessage } from "@/lib/api/ai-error-codes";
import { postJson } from "@/lib/api/post-json";
import { CRISIS_GUIDANCE_TEXT } from "@/features/ai-summary/services/prompt";
import { PURPOSE_OPTIONS_BY_LIFESTAGE } from "@/features/support/constants/purpose-options";
import {
  PURPOSE_PICKUP_FREE_TEXT_MAX_LENGTH,
  PurposePickupResponseSchema,
} from "@/features/purpose-pickup/schema/purpose-pickup";
import type { PurposePickupResponse } from "@/features/purpose-pickup/schema/purpose-pickup";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import type { AgeGroup } from "@/features/support/schema/age-group";
import { buildPurposeToResultsHref, buildSupportBackHref } from "@/features/support/services/results-url";
import { cn } from "@/lib/utils";

interface PurposeSelectionFormProps {
  lifestage: Lifestage;
  municipality: string;
  /** URL書き込みに使う区市町村の5桁コード。 */
  municipalityCode: string;
  ageGroup: AgeGroup;
  /** `/support` から引き継いだ相談分野タグ(FR-023)。結果画面へそのまま引き継ぐ。 */
  tags: SupportTag[];
  /** 見出し表示用。`LIFESTAGE_OPTIONS` から呼び出し側で解決済みのラベルを渡す。 */
  lifestageLabel: string;
}

/** 「それ以外」フローのステートマシン(`AiSummarySection` の `Step` と同じ構成)。 */
type OtherStep = "closed" | "input" | "preview" | "sending" | "result" | "error";

const DEFAULT_ERROR_MESSAGE = "目的の検索に失敗しました。もう一度お試しください。";

/**
 * 目的選択画面(`/support/purpose`)のクライアント側本体。
 *
 * `/support` で選んだ年齢(ライフステージ)・区市町村を踏まえ、`PURPOSE_OPTIONS_BY_LIFESTAGE`
 * から該当ライフステージの目的一覧をボタンとして提示する。具体的な目的を選ぶと即座に
 * `purpose=<purposeId>` を付けて `/support/results` へ遷移する単発選択の画面であり、
 * `SupportInputForm` のようなチェック付き選択・フォーム送信は行わない。
 *
 * 「それ以外」を選んだ場合は自由記述用の textarea を表示し、`/api/purpose-pickup` を
 * 呼び出して目的をAIにピックアップさせる(TICKET未定、`AiSummarySection` と同じ
 * 「入力 → プレビュー → 同意して送信 → 結果」のステートマシンを踏襲)。
 * `handleConsentAndSend` より前に fetch は一切発行しない(FR-041 と同じ「送信前プレビュー」原則)。
 *
 * プライバシー上絶対に守るべき制約: 自由記述テキスト(otherText)は `handleConsentAndSend` の
 * リクエストボディ以外のいかなる送信先(URLクエリ等)にも一切含めない。「一覧を見る」
 * (`handleViewList`)は目的パラメータなしで、AIが選んだ目的で探す場合(`handleUseMatchedPurpose`)も
 * `matchedPurposeId` のみを付与し、自由記述そのものはURLに一切含めない。
 */
export function PurposeSelectionForm({ lifestage, municipality, municipalityCode, ageGroup, tags, lifestageLabel }: PurposeSelectionFormProps) {
  const router = useRouter();
  const [otherStep, setOtherStep] = useState<OtherStep>("closed");
  const [otherText, setOtherText] = useState("");
  const [pickupResult, setPickupResult] = useState<PurposePickupResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState(DEFAULT_ERROR_MESSAGE);
  const otherTextareaId = useId();

  const purposeOptions = PURPOSE_OPTIONS_BY_LIFESTAGE[lifestage];
  const trimmedOtherText = otherText.trim();

  function handleSelectPurpose(purposeId: string) {
    router.push(buildPurposeToResultsHref({ age: ageGroup, municipalityCode, lifestage, tags, purposeId }));
  }

  function handleSelectOther() {
    setOtherStep("input");
  }

  function handleViewList() {
    // 自由記述の内容(otherText)はここでも一切参照しない(プライバシー上の理由、絶対厳守)。
    // 目的パラメータを付けず、通常の一覧として遷移する。
    router.push(buildPurposeToResultsHref({ age: ageGroup, municipalityCode, lifestage, tags }));
  }

  function handleShowPreview() {
    if (trimmedOtherText.length === 0) return;
    setOtherStep("preview");
  }

  function handleCancelPreview() {
    setOtherStep("input");
  }

  async function handleConsentAndSend() {
    setOtherStep("sending");
    const result = await postJson(
      "/api/purpose-pickup",
      { freeText: trimmedOtherText, lifestage },
      PurposePickupResponseSchema,
    );

    if (!result.ok) {
      if (result.reason === "http-error") {
        setErrorMessage(resolveAiErrorMessage(extractApiErrorCode(result.errorBody), DEFAULT_ERROR_MESSAGE));
      }
      setOtherStep("error");
      return;
    }

    setPickupResult(result.data);
    setOtherStep("result");
  }

  function handleResend() {
    setOtherStep("preview");
  }

  function handleRetry() {
    // ユーザーが再入力しやすいよう、AiSummarySection の handleRetry と異なり otherText はクリアしない。
    setPickupResult(null);
    setOtherStep("input");
  }

  function handleUseMatchedPurpose(purposeId: string) {
    // AIが選んだ目的で探す場合も、自由記述テキスト自体はURLに一切含めない
    // (既存の目的ボタンクリック時と全く同じクエリパラメータ構成)。
    handleSelectPurpose(purposeId);
  }

  const matchedPurposeLabel =
    pickupResult?.matchedPurposeId != null
      ? purposeOptions.find((option) => option.id === pickupResult.matchedPurposeId)?.label
      : undefined;

  const backHref = buildSupportBackHref({ municipalityCode, lifestage, tags });

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]"
    >
      <GhostBackLink href={backHref}>年齢・地域の選択に戻る</GhostBackLink>

      <div className="flex flex-col gap-2 text-center">
        <span className="text-xs font-normal text-muted-foreground">ステップ 3/3</span>
        <h1 className="text-xl font-bold text-foreground">相談したいことを選ぶ</h1>
        <p className="text-sm text-muted-foreground">当てはまるものを選ぶと、目的に合わせた支援情報を探せます。</p>
      </div>

      <section aria-label="現在の検索条件" className="rounded-lg border border-border bg-muted/60 p-4 text-sm">
        <p className="font-medium text-foreground">この条件で探します</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <ConditionPill label="年齢" value={lifestageLabel} />
          <ConditionPill label="地域" value={municipality} />
          <ConditionPillList tags={tags} />
        </div>
      </section>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-base font-semibold text-foreground">どのようなことで相談したいですか？</legend>
        <div className="grid grid-cols-1 gap-3">
          {purposeOptions.map((option) => (
            <Button
              key={option.id}
              type="button"
              variant="outline"
              size="lg"
              className={cn("h-auto min-h-14 w-full justify-center py-4 text-base", "bg-white shadow-sm dark:bg-card")}
              onClick={() => handleSelectPurpose(option.id)}
            >
              {option.label}
            </Button>
          ))}
          <Button
            type="button"
            variant={otherStep !== "closed" ? "default" : "outline"}
            size="lg"
            aria-pressed={otherStep !== "closed"}
            className={cn(
              "h-auto min-h-14 w-full justify-center py-4 text-base",
              otherStep === "closed" && "bg-white shadow-sm dark:bg-card",
            )}
            onClick={handleSelectOther}
          >
            それ以外
          </Button>
        </div>
      </fieldset>

      {otherStep !== "closed" && (
        <section aria-live="polite" className="flex flex-col gap-3 rounded-lg border border-border bg-muted/60 p-4 text-left">
          {(otherStep === "input" || otherStep === "preview") && (
            <>
              <label htmlFor={otherTextareaId} className="text-sm font-medium text-foreground">
                どのようなことでお困りですか?(任意)
              </label>
              <Textarea
                id={otherTextareaId}
                value={otherText}
                onChange={(event) => setOtherText(event.target.value)}
                maxLength={PURPOSE_PICKUP_FREE_TEXT_MAX_LENGTH}
                rows={3}
                disabled={otherStep === "preview"}
                placeholder="例: 会議の内容を覚えておくのが難しく、相談できる窓口を探している など"
              />
            </>
          )}

          {otherStep === "input" && (
            <div className="flex flex-col gap-2">
              <Button
                type="button"
                size="lg"
                className="w-full"
                disabled={trimmedOtherText.length === 0}
                onClick={handleShowPreview}
              >
                <Send aria-hidden="true" />
                送信内容を確認
              </Button>
              <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleViewList}>
                一覧を見る
              </Button>
            </div>
          )}

          {otherStep === "preview" && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
              <p className="font-semibold text-foreground">送信内容を確認してください。</p>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">送信されるもの</p>
                <p className="text-foreground">入力テキスト: 「{trimmedOtherText}」</p>
              </div>

              <div className="flex flex-col gap-1">
                <p className="text-xs font-medium text-muted-foreground">送信されないもの</p>
                <p className="text-foreground">ライフステージ・地域・氏名等の個人情報</p>
              </div>

              <div className="flex flex-col gap-2">
                <Button type="button" size="lg" className="w-full" onClick={handleConsentAndSend}>
                  <Sparkles aria-hidden="true" />
                  同意して送信
                </Button>
                <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleCancelPreview}>
                  キャンセル
                </Button>
              </div>
            </div>
          )}

          {otherStep === "sending" && <AiThinkingIndicator label="AIが目的を探しています…" />}

          {otherStep === "result" && pickupResult && (
            <div className="flex flex-col gap-3 rounded-lg border border-border p-4 text-sm">
              {pickupResult.isCrisisResponse ? (
                <>
                  <p className="text-foreground">{CRISIS_GUIDANCE_TEXT}</p>
                  <Button type="button" size="lg" className="w-full" onClick={handleViewList}>
                    一覧を見る
                  </Button>
                </>
              ) : pickupResult.matchedPurposeId != null ? (
                <>
                  <ProvenanceLabel source="ai" />
                  <p className="text-foreground">AIが選んだ目的: {matchedPurposeLabel ?? "(不明な目的)"}</p>
                  <Button
                    type="button"
                    size="lg"
                    className="w-full"
                    onClick={() => handleUseMatchedPurpose(pickupResult.matchedPurposeId as string)}
                  >
                    この目的で探す
                  </Button>
                  <Button type="button" variant="ghost" size="lg" className="w-full" onClick={handleViewList}>
                    一覧を見る
                  </Button>
                </>
              ) : pickupResult.isAiEnabled ? (
                <>
                  <p className="text-foreground">
                    当てはまる目的が見つかりませんでした。恐れ入りますが、一覧からお探しください。
                  </p>
                  <Button type="button" size="lg" className="w-full" onClick={handleViewList}>
                    一覧を見る
                  </Button>
                </>
              ) : (
                <>
                  <p className="text-foreground">{AI_DISABLED_MESSAGE}</p>
                  <Button type="button" size="lg" className="w-full" onClick={handleViewList}>
                    一覧を見る
                  </Button>
                </>
              )}
            </div>
          )}

          {otherStep === "error" && (
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
      )}
    </main>
  );
}
