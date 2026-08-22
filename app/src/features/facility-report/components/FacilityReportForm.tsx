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
import { SingleChoiceButtonGroup } from "@/components/common/SingleChoiceButtonGroup";
import { Button } from "@/components/ui/button";

import { useReportSubmission } from "@/lib/report-form/use-report-submission";

import { CLOSURE_STATUS_OPTIONS, FACILITY_REPORT_CATEGORY_OPTIONS } from "@/features/facility-report/services/report-categories";
import {
  FACILITY_REPORT_DETAIL_MAX_LENGTH,
  FacilityReportResponseSchema,
  type ClosureStatus,
  type ReportCategory,
  type ReportableFacility,
} from "@/features/facility-report/schema/facility-report";

interface FacilityReportFormProps {
  facility: ReportableFacility;
  /** キャンセル・閉じる操作後の遷移先(検索結果ページ等、page.tsx が算出して渡す)。 */
  backHref: string;
}

interface FormState {
  category: ReportCategory | null;
  closureStatus: ClosureStatus | null;
  correctedValue: string;
  detailText: string;
  website: string;
}

const INITIAL_FORM_STATE: FormState = {
  category: null,
  closureStatus: null,
  correctedValue: "",
  detailText: "",
  website: "",
};

/**
 * 掲載情報の誤り報告フォーム(TICKET-0064)。
 *
 * `/support/facility-report` 専用ページ(page.tsx)から埋め込まれる。このアプリで初めて
 * 利用者投稿の自由記述内容を D1 に永続化する機能であるため、既存の AI 機能
 * (PreparePanel/AiSummarySection/RecommendHintSection)と同じ「送信内容を確認したうえで
 * 送信する」明示同意ステップ(preview)を必ず経由させる(design review により load-bearing と
 * 位置づけられている)。
 *
 * もとはダイアログ・プリミティブ(base-ui)ベースのモーダルだったが、このアプリの「選択 →
 * 条件付き入力 → 確認 → 送信 → 完了」という複数ステップフローの慣例(PreparePanel/
 * AiSummarySection/RecommendHintSection と同じく専用ページ+戻るリンク)に合わせ、
 * 専用ページへ変換した(チームレビューにより、モーダル内スクロール(85vh 制限)が
 * 窮屈という指摘を受けた)。
 * ページの遷移は `backHref`(page.tsx が検索結果ページの URL から算出)への
 * `router.push` で行う。ページ遷移ごとにコンポーネントが再マウントされるため、
 * 「再度開かれたら初期状態に戻す」ためだけの state リセットロジックは不要(state は
 * useState の初期値のまま素直に持てばよい)。
 *
 * 「現在の掲載内容」表示は `facility` prop(表示用データ)から読むが、実際にサーバーへ保存する
 * スナップショットはサーバー側で D1 から独立して再取得する(route.ts 参照)ため、この表示値が
 * 古くても保存内容には影響しない(UI上の軽微な不整合リスクのみ)。
 *
 * StepIndicator・TextField・LabeledTextarea・CategoryGroup・ハニーポット・sticky送信フッター・
 * sending/done/errorのステップ表示は `ContentReportForm.tsx`(想定ルート・学校情報・結果の見方
 * ガイド向けの一般化版)と完全一致していたため、Phase 2 「2-10 ReportFormParts」で
 * `src/components/common/report-form/` へ共通部品として抽出した。このフォーム固有の
 * `CurrentValueBlock`(現在の掲載内容表示)・closure(閉鎖/移転等)カテゴリの分岐は
 * 共通化の対象外とし、このファイルにそのまま残している。
 */
export function FacilityReportForm({ facility, backHref }: FacilityReportFormProps) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(INITIAL_FORM_STATE);
  const { step, isRateLimited, goToPreview, goToForm, submit } = useReportSubmission({
    endpoint: "/api/facility-report",
    responseSchema: FacilityReportResponseSchema,
  });

  const selectedCategoryOption = FACILITY_REPORT_CATEGORY_OPTIONS.find((option) => option.value === form.category);
  const selectedClosureStatusOption = CLOSURE_STATUS_OPTIONS.find((option) => option.value === form.closureStatus);

  const canAdvanceToPreview =
    form.category !== null &&
    (form.category !== "closure" || form.closureStatus !== null) &&
    (form.category !== "unclear" && form.category !== "other"
      ? true
      : form.detailText.trim().length > 0);

  function updateForm(patch: Partial<FormState>) {
    setForm((prev) => ({ ...prev, ...patch }));
  }

  function handleCategorySelect(category: ReportCategory) {
    // カテゴリを切り替えたら、他カテゴリ専用の値は持ち越さない(closureStatusはclosure専用)。
    setForm((prev) => ({
      ...prev,
      category,
      closureStatus: category === "closure" ? prev.closureStatus : null,
    }));
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
      facilityId: facility.id,
      category: form.category,
      closureStatus: form.category === "closure" ? (form.closureStatus ?? undefined) : undefined,
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
            <p className="mt-1 text-sm text-muted-foreground">
              {facility.name}の掲載情報について、気づいた点をお知らせください。
            </p>
          </div>
          <p className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            掲載情報の訂正・更新専用です。氏名・連絡先・相談内容などの個人情報は入力しないでください。
          </p>

          <ReportCategoryGroup options={FACILITY_REPORT_CATEGORY_OPTIONS} selectedValue={form.category} onSelect={handleCategorySelect} />
          <p className="-mt-3 text-xs text-muted-foreground">まず、最も気になるものを1つ選んでください。</p>

          {form.category !== null && (
            <>
              {form.category === "phone" && facility.phone && (
                <CurrentValueBlock label="いま掲載している電話番号" value={facility.phone} />
              )}
              {form.category === "address" && facility.address && (
                <CurrentValueBlock label="いま掲載している所在地" value={facility.address} />
              )}
              {form.category === "link" && facility.url && <CurrentValueBlock label="いま掲載しているリンク先" value={facility.url} />}
              {(form.category === "content" || form.category === "unclear") && facility.summary && (
                <CurrentValueBlock label="いま掲載している説明" value={facility.summary} />
              )}

              {form.category === "phone" && (
                <ReportTextField
                  label="正しいと思われる電話番号(任意)"
                  value={form.correctedValue}
                  onChange={(value) => updateForm({ correctedValue: value })}
                />
              )}
              {form.category === "address" && (
                <ReportTextField
                  label="正しいと思われる所在地(任意)"
                  value={form.correctedValue}
                  onChange={(value) => updateForm({ correctedValue: value })}
                />
              )}
              {form.category === "content" && (
                <ReportLabeledTextarea
                  label="正しい内容(任意)"
                  value={form.correctedValue}
                  onChange={(value) => updateForm({ correctedValue: value })}
                />
              )}
              {form.category === "closure" && (
                <SingleChoiceButtonGroup
                  options={CLOSURE_STATUS_OPTIONS}
                  selectedValue={form.closureStatus}
                  onSelect={(value) => updateForm({ closureStatus: value })}
                  legend="現在の状況を選んでください"
                />
              )}
              {form.category === "unclear" && (
                <ReportLabeledTextarea
                  label="どの部分が分かりにくいですか？（入力必須）"
                  value={form.detailText}
                  onChange={(value) => updateForm({ detailText: value })}
                  maxLength={FACILITY_REPORT_DETAIL_MAX_LENGTH}
                />
              )}
              {form.category === "link" && (
                <ReportTextField
                  label="正しいと思われるリンク先(任意)"
                  value={form.correctedValue}
                  onChange={(value) => updateForm({ correctedValue: value })}
                />
              )}

              {form.category !== "unclear" && (
                <ReportLabeledTextarea
                  label={form.category === "other" ? "内容を入力してください（入力必須）" : "補足があれば入力してください（任意）"}
                  value={form.detailText}
                  onChange={(value) => updateForm({ detailText: value })}
                  placeholder="例: 公式サイトでは受付時間が16時までと記載されています。"
                  maxLength={FACILITY_REPORT_DETAIL_MAX_LENGTH}
                />
              )}

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
            <div><p className="text-xs font-medium text-muted-foreground">対象施設</p><p>{facility.name}（{facility.municipality}）</p></div>
            <div><p className="text-xs font-medium text-muted-foreground">報告内容</p><p>{selectedCategoryOption?.label}{form.category === "closure" && selectedClosureStatusOption ? `（${selectedClosureStatusOption.label}）` : ""}</p></div>
            {form.correctedValue.trim() && <div><p className="text-xs font-medium text-muted-foreground">正しいと思われる内容</p><p>{form.correctedValue.trim()}</p></div>}
            {form.detailText.trim() && <div><p className="text-xs font-medium text-muted-foreground">補足</p><p>{form.detailText.trim()}</p></div>}
          </div>
          <p className="text-xs text-muted-foreground">
            上記の内容と対象施設の掲載情報を送信します。お名前やメールアドレスなどの連絡先情報は送信されません。
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

function CurrentValueBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-xs font-medium text-foreground">{label}</p>
      <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">{value}</p>
    </div>
  );
}
