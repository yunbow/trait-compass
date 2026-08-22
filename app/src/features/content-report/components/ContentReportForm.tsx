"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { ReportCategoryGroup } from "@/components/common/report-form/CategoryGroup";
import { ReportDoneStep } from "@/components/common/report-form/DoneStep";
import { ReportErrorStep } from "@/components/common/report-form/ErrorStep";
import { ReportHoneypotField } from "@/components/common/report-form/HoneypotField";
import { ReportLabeledTextarea } from "@/components/common/report-form/LabeledTextarea";
import { ReportSendingStep } from "@/components/common/report-form/SendingStep";
import { ReportStepIndicator } from "@/components/common/report-form/StepIndicator";
import { ReportSubmitFooter } from "@/components/common/report-form/SubmitFooter";
import { ReportTextField } from "@/components/common/report-form/TextField";
import { Button } from "@/components/ui/button";

import { useReportSubmission } from "@/lib/report-form/use-report-submission";

import {
  CONTENT_REPORT_CORRECTED_VALUE_MAX_LENGTH,
  CONTENT_REPORT_DETAIL_MAX_LENGTH,
  ContentReportResponseSchema,
} from "@/features/content-report/schema/content-report";
import type { ContentReportCategoryOption } from "@/features/content-report/services/report-categories";
import {
  CONTENT_REPORT_CORRECTED_VALUE_CATEGORIES,
  CONTENT_REPORT_MANDATORY_DETAIL_CATEGORIES,
} from "@/features/content-report/services/report-categories";

interface ContentReportFormProps {
  /** 対象種別。文言の出し分けには使わない(この2種の共通カテゴリ配列だけで条件付き項目を決める)が、
   *  将来 target 種別ごとの文言差し込みが必要になった際の拡張余地として保持する。 */
  targetType: "pathway" | "school" | "guide";
  /** 「対象」欄に表示する文脈文字列(例: 「台東区 ／ 想定ルート（発達相談）」)。page.tsx が構築する。 */
  targetContext: string;
  categoryOptions: ContentReportCategoryOption<string>[];
  /** キャンセル・閉じる操作後の遷移先(検索結果ページ等、page.tsx が算出して渡す)。 */
  backHref: string;
  /**
   * `/api/content-report` リクエストボディのうち対象を特定する部分(targetType + targetId、
   * または targetType + municipality/tab/lifestage)。page.tsx が算出したプレーンな
   * シリアライズ可能値(サーバー→クライアントコンポーネント間で関数は渡せないため)。
   * 送信時にフォーム入力欄の値とマージする。
   */
  targetPayload: Record<string, unknown>;
}

interface FormState {
  category: string | null;
  correctedValue: string;
  detailText: string;
  website: string;
}

const INITIAL_FORM_STATE: FormState = {
  category: null,
  correctedValue: "",
  detailText: "",
  website: "",
};

/**
 * 掲載情報の訂正・更新報告フォーム(想定ルート・学校情報・結果の見方ガイド共通)。
 *
 * `FacilityReportForm`(TICKET-0064)の対象を一般化したもの。3種類の対象それぞれに
 * ほぼ同じ「選択 → 条件付き入力 → 確認 → 送信 → 完了」ステップ機を持つコンポーネントを
 * 作らず、この1コンポーネントを対象種別ごとに `page.tsx` からパラメータ化して埋め込む。
 *
 * どのカテゴリで「正しいと思われる内容」欄・「補足(必須/任意)」欄を出し分けるかは、対象種別
 * ごとの分岐ではなく `report-categories.ts` の共通配列(`CONTENT_REPORT_CORRECTED_VALUE_CATEGORIES`/
 * `CONTENT_REPORT_MANDATORY_DETAIL_CATEGORIES`)のみから決める(3種のカテゴリ値がすべて
 * ユニークなため、対象種別を見ずに判定できる)。
 *
 * ページ遷移は `backHref`(page.tsx が算出)への `router.push` で行う。ページ遷移ごとに
 * コンポーネントが再マウントされるため、state リセットロジックは不要。
 *
 * StepIndicator・TextField・LabeledTextarea・CategoryGroup・ハニーポット・sticky送信フッター・
 * sending/done/errorのステップ表示は `FacilityReportForm.tsx` と完全一致していたため、
 * Phase 2 「2-10 ReportFormParts」で `src/components/common/report-form/` へ共通部品として
 * 抽出した。
 */
export function ContentReportForm({ targetContext, categoryOptions, backHref, targetPayload }: ContentReportFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM_STATE);
  const { step, isRateLimited, goToPreview, goToForm, submit } = useReportSubmission({
    endpoint: "/api/content-report",
    responseSchema: ContentReportResponseSchema,
  });

  const selectedCategoryOption = categoryOptions.find((option) => option.value === form.category);
  const requiresDetail = form.category !== null && CONTENT_REPORT_MANDATORY_DETAIL_CATEGORIES.includes(form.category);
  const showsCorrectedValue = form.category !== null && CONTENT_REPORT_CORRECTED_VALUE_CATEGORIES.includes(form.category);

  const canAdvanceToPreview =
    form.category !== null && (!requiresDetail || form.detailText.trim().length > 0);

  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleCategorySelect(category: string) {
    setForm((prev) => ({ ...prev, category }));
  }

  function handleShowPreview() {
    if (!canAdvanceToPreview) return;
    goToPreview();
  }

  function handleBackToForm() {
    goToForm();
  }

  async function handleSubmit() {
    if (form.category === null) return;
    await submit({
      ...targetPayload,
      category: form.category,
      correctedValue: form.correctedValue.trim() || undefined,
      detailText: form.detailText.trim() || undefined,
      website: form.website,
    });
  }

  function handleRetry() {
    goToPreview();
  }

  function handleLeave() {
    router.push(backHref);
  }

  return (
    <div className="flex flex-col gap-4">
      {step === "form" && (
        <div className="flex flex-col gap-4">
          <div>
            <ReportStepIndicator current={1} />
            <p className="mt-1 text-sm text-muted-foreground">{targetContext}の掲載情報について、気づいた点をお知らせください。</p>
          </div>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            掲載情報の訂正・更新専用です。氏名・連絡先・相談内容などの個人情報は入力しないでください。
          </p>

          <ReportCategoryGroup options={categoryOptions} selectedValue={form.category} onSelect={handleCategorySelect} />
          <p className="-mt-3 text-xs text-muted-foreground">まず、最も気になるものを1つ選んでください。</p>

          {form.category !== null && (
            <>
              {showsCorrectedValue && (
                <ReportTextField
                  label="正しいと思われる内容(任意)"
                  value={form.correctedValue}
                  onChange={(value) => updateForm({ correctedValue: value })}
                  maxLength={CONTENT_REPORT_CORRECTED_VALUE_MAX_LENGTH}
                />
              )}

              <ReportLabeledTextarea
                label={requiresDetail ? "どのような点が気になりますか？（入力必須）" : "補足があれば入力してください（任意）"}
                value={form.detailText}
                onChange={(value) => updateForm({ detailText: value })}
                maxLength={CONTENT_REPORT_DETAIL_MAX_LENGTH}
              />
            </>
          )}

          <ReportHoneypotField value={form.website} onChange={(value) => updateForm({ website: value })} />

          <ReportSubmitFooter disabled={!canAdvanceToPreview} onClick={handleShowPreview} />
        </div>
      )}

      {step === "preview" && form.category !== null && (
        <div className="flex flex-col gap-4">
          <div>
            <ReportStepIndicator current={2} />
            <h2 className="mt-1 text-base font-semibold text-foreground">送信内容を確認</h2>
          </div>
          <div className="flex flex-col gap-3 rounded-md bg-muted px-3 py-3 text-sm text-foreground">
            <div>
              <p className="text-xs font-medium text-muted-foreground">対象</p>
              <p>{targetContext}</p>
            </div>
            <div>
              <p className="text-xs font-medium text-muted-foreground">報告内容</p>
              <p>{selectedCategoryOption?.label}</p>
            </div>
            {form.correctedValue.trim() && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">正しいと思われる内容</p>
                <p>{form.correctedValue.trim()}</p>
              </div>
            )}
            {form.detailText.trim() && (
              <div>
                <p className="text-xs font-medium text-muted-foreground">補足</p>
                <p>{form.detailText.trim()}</p>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            上記の内容と対象の掲載情報を送信します。お名前やメールアドレスなどの連絡先情報は送信されません。
          </p>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={handleBackToForm}>
              修正する
            </Button>
            <Button type="button" onClick={handleSubmit}>
              この内容で送信
            </Button>
          </div>
        </div>
      )}

      {step === "sending" && <ReportSendingStep />}

      {step === "done" && <ReportDoneStep onLeave={handleLeave} />}

      {step === "error" && <ReportErrorStep isRateLimited={isRateLimited} onRetry={handleRetry} onLeave={handleLeave} />}
    </div>
  );
}
