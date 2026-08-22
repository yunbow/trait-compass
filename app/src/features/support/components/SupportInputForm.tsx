"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { Check } from "lucide-react";

import { ConditionPillList } from "@/components/common/ConditionPill";
import { GhostBackLink } from "@/components/common/GhostBackLink";
import { Button } from "@/components/ui/button";
import { isSupportInputMemoryEnabled } from "@/features/history/services/settings";
import { MunicipalityCombobox } from "@/features/support/components/MunicipalityCombobox";
import { SupportTagToggleGroup } from "@/features/support/components/SupportTagToggleGroup";
import { findNearestMunicipality } from "@/features/support/constants/municipality-centers";
import type { Municipality } from "@/features/support/constants/municipalities";
import { getMunicipalityByName } from "@/features/support/constants/municipality-registry";
import { useSupportInputSelection } from "@/features/support/hooks/useSupportInputSelection";
import { useCurrentLocation } from "@/features/support/hooks/useCurrentLocation";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";
import {
  LIFESTAGE_OPTIONS,
  mapLifestageToAgeGroup,
} from "@/features/support/services/lifestage-mapping";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";
import { saveSupportInputSelection } from "@/features/support/services/support-input-storage";
import { buildPurposeHref } from "@/features/support/services/results-url";
import { setSupportTagsParam } from "@/features/support/services/support-tag-url";
import { cn } from "@/lib/utils";

interface SupportInputFormProps {
  /**
   * 結果画面から引き継いだ相談分野タグ(FR-023)。`app/support/page.tsx` が
   * `parseSupportTagsParam` で検証済みの値のみを渡す。
   * 空配列の場合は「全般」扱いとし、`tags` クエリを付けずに転送する。
   */
  initialTags: SupportTag[];
  /**
   * `/support/results` の「条件を見直す」導線で引き継ぐ、選択済みだった年齢(ライフステージ)の
   * プリフィル値。`app/support/page.tsx` が `parseLifestagePrefillParam` で検証済みの値のみを渡す。
   */
  initialLifestage?: Lifestage | null;
  /**
   * `/support/results` の「条件を見直す」導線で引き継ぐ、選択済みだった区市町村名のプリフィル値。
   * `app/support/page.tsx` が `parseMunicipalityParam` で検証済みの値のみを渡す。
   */
  initialMunicipality?: string | null;
}

/**
 * 年齢・地域選択画面(TICKET-0014、TICKET-0044 でライフステージ選択に拡張)のクライアント側本体。
 *
 * 年齢の入力は、5区分のライフステージ(未就学児/小学生・中学生/高校生/大学生・専門学校生/
 * 社会人)選択として提示する(TICKET-0044 AC-1)。選択されたライフステージは
 * `mapLifestageToAgeGroup` で既存の `AgeGroup`(child/adult の2値、FR-021)へ変換してから
 * 検索条件として扱うため、D1/zod 側のスキーマは一切変更しない(AC-3)。
 * 居住区市町村と合わせて2問構成である点は変わらない(FR-022)。「年齢と地域の保存」がONの場合のみ、
 * 年齢・区市町村を localStorage に保存して次回復元する(historyEnabled とは独立した設定。
 * TICKET-0027 の設定分離)。OFF(既定)の場合は従来どおり React
 * state のみで保持し、送信時に `/support/purpose`(目的選択画面)のクエリパラメータとして
 * 引き渡した後、画面を離れると値は破棄される(NFR-32)。
 */
export function SupportInputForm({
  initialTags,
  initialLifestage = null,
  initialMunicipality = null,
}: SupportInputFormProps) {
  const router = useRouter();
  const { isHydrated, supportInputMemoryEnabled, selection: savedSelection } = useSupportInputSelection();
  const { state: locationState, request } = useCurrentLocation();

  // ユーザーがこの画面で自分で選んだ値のみを保持する。実際の表示・送信値は下で URL
  // プリフィル・保存済み選択とレンダー時にマージし、useEffect で同期しない。
  const [lifestageOverride, setLifestageOverride] = useState<Lifestage | null>(null);
  const [municipalityOverride, setMunicipalityOverride] = useState<string | null>(null);
  const [selectedTags, setSelectedTags] = useState<SupportTag[]>(initialTags);

  // Re-check all competing sources at resolution time so a delayed lookup cannot overwrite
  // a manual choice or hydrated saved selection.
  useEffect(() => {
    if (locationState.status !== "granted") return;
    if (municipalityOverride !== null) return;
    if (isHydrated && savedSelection?.municipality) return;
    const nearest = findNearestMunicipality(locationState.coords);
    // This intentional state sync is the resolution of the one-shot browser API; the
    // guards immediately above are evaluated from the latest render to prevent races.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (nearest) setMunicipalityOverride(nearest.municipality);
  }, [locationState, municipalityOverride, isHydrated, savedSelection]);

  const lifestage: Lifestage | null =
    lifestageOverride ?? initialLifestage ?? (isHydrated ? savedSelection?.lifestage ?? null : null);
  const municipality: string =
    municipalityOverride ?? initialMunicipality ?? (isHydrated ? savedSelection?.municipality ?? "" : "");

  const ageGroup = lifestage !== null ? mapLifestageToAgeGroup(lifestage) : null;
  const canSubmit = ageGroup !== null && municipality !== "";
  const submitHint =
    lifestage === null && municipality === ""
      ? "年齢と区市町村を選ぶと進めます。"
      : lifestage === null
        ? "年齢を選ぶと進めます。"
        : municipality === ""
          ? "区市町村を選ぶと進めます。"
          : "支援情報を検索できます。";

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSubmit || lifestage === null) return;

    const municipalityEntry = getMunicipalityByName(municipality);
    if (municipalityEntry === null) return;

    router.push(buildPurposeHref({ age: ageGroup, municipalityCode: municipalityEntry.code, lifestage, tags: selectedTags }));
  }

  function handleSelectLifestage(value: Lifestage) {
    setLifestageOverride(value);
    if (isSupportInputMemoryEnabled()) {
      saveSupportInputSelection({ lifestage: value, municipality: (municipality || null) as Municipality | null });
    }
  }

  function handleChangeMunicipality(value: string) {
    setMunicipalityOverride(value);
    if (isSupportInputMemoryEnabled()) {
      saveSupportInputSelection({ lifestage, municipality: (value || null) as Municipality | null });
    }
  }

  // タグ選択はこの画面内の一時的な入力状態だが、共有・ブラウザの戻る操作に耐えられるよう
  // URL にも即時反映する(サーバーへの再取得は発生させないため router.replace ではなく
  // history.replaceState を使う。FacilityListSection の subtype クエリ同期と同じ方針)。
  // tagsクエリはASCII ID化(support-tag-url.ts の setSupportTagsParam)して書き込む。
  function setTagsInUrl(tags: SupportTag[]) {
    const params = new URLSearchParams(window.location.search);
    setSupportTagsParam(params, tags);
    const query = params.toString();
    window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
  }

  function handleToggleTag(tag: SupportTag) {
    const next = selectedTags.includes(tag)
      ? selectedTags.filter((value) => value !== tag)
      : [...selectedTags, tag];
    setSelectedTags(next);
    setTagsInUrl(next);
  }

  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 pt-[max(3rem,env(safe-area-inset-top))] pb-[max(3rem,env(safe-area-inset-bottom))]"
    >
      {initialTags.length > 0 ? (
        <GhostBackLink href="/result">結果に戻る</GhostBackLink>
      ) : (
        <GhostBackLink href="/">トップに戻る</GhostBackLink>
      )}

      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-xl font-bold text-foreground">相談する方に合う相談先を探す</h1>
        <p className="text-sm text-muted-foreground">年齢・地域・困りごとに合わせて、東京都の支援情報を探せます。</p>
      </div>

      <div role="note" className="rounded-lg border border-border bg-muted px-4 py-3 text-left text-sm text-foreground">
        {supportInputMemoryEnabled ? (
          <>
            <p className="font-semibold">入力内容は検索に使います。</p>
            <p className="mt-1">「年齢と地域の保存」設定がONのため、次回の入力の手間を減らすためこの端末に保存されます。</p>
          </>
        ) : (
          <>
            <p className="font-semibold">入力内容は検索にのみ使います。</p>
            <p className="mt-1">端末にもサーバーにも保存されません。</p>
          </>
        )}
        <p className="mt-1 text-muted-foreground">これは医学的な診断ではありません。</p>
      </div>

      <form onSubmit={handleSubmit} className="flex flex-col gap-8" noValidate>
        <fieldset className="flex flex-col gap-3">
          <legend className="text-base font-medium text-foreground">
            <span className="block text-xs font-normal text-muted-foreground">ステップ 1/3</span>
            相談したい方の年齢を選んでください
          </legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {LIFESTAGE_OPTIONS.map((option) => (
              <Button
                key={option.value}
                type="button"
                variant={lifestage === option.value ? "default" : "outline"}
                size="lg"
                aria-pressed={lifestage === option.value}
                className={cn(
                  "h-auto min-h-14 w-full justify-center py-4 text-base",
                  lifestage !== option.value && "bg-white shadow-sm dark:bg-card",
                )}
                onClick={() => handleSelectLifestage(option.value)}
              >
                {lifestage === option.value && <Check aria-hidden="true" className="size-5" />}
                {option.label}
              </Button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2 text-left">
          <label htmlFor="support-municipality" className="text-base font-medium text-foreground">
            <span className="block text-xs font-normal text-muted-foreground">ステップ 2/3</span>
            お住まいの区市町村
          </label>
          <MunicipalityCombobox value={municipality} onValueChange={handleChangeMunicipality} />
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="w-full"
            onClick={request}
            disabled={locationState.status === "loading"}
          >
            {locationState.status === "loading" ? "現在地を取得中…" : "現在地から探す"}
          </Button>
          {locationState.status === "denied" && (
            <p className="text-xs text-destructive">位置情報の利用が許可されませんでした。区市町村を選んでください。</p>
          )}
          {locationState.status === "unavailable" && (
            <p className="text-xs text-destructive">現在地を取得できませんでした。区市町村を選んでください。</p>
          )}
          <p className="text-xs text-muted-foreground">例: 新宿区、八王子市</p>
        </div>

        {initialTags.length > 0 && (
          <section aria-label="引き継いだ相談分野" className="rounded-lg border border-border bg-muted/40 p-4">
            <p className="text-sm font-medium text-foreground">引き継いだ相談分野</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <ConditionPillList tags={selectedTags} variant="outline" />
            </div>
            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium text-primary outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
                相談分野を変更する
              </summary>
              <div className="mt-3">
                <SupportTagToggleGroup
                  legend="この結果から提案された相談分野"
                  description="必要に応じて変更できます。選んだ分野で相談先を絞り込みます。"
                  selectedTags={selectedTags}
                  onToggle={handleToggleTag}
                />
              </div>
            </details>
          </section>
        )}

        <div className="flex flex-col gap-2">
          {lifestage !== null && municipality !== "" && (
            <p className="text-center text-sm text-muted-foreground">
              検索条件: {LIFESTAGE_OPTIONS.find((option) => option.value === lifestage)?.label} ／ {municipality}
            </p>
          )}
          <Button type="submit" size="lg" disabled={!canSubmit} aria-describedby="support-submit-hint" className="sticky bottom-3 z-10 w-full shadow-md">
            次へ：相談したいことを選ぶ
          </Button>
          <p id="support-submit-hint" className="text-center text-sm text-muted-foreground">
            {submitHint}
          </p>
        </div>

      </form>
    </main>
  );
}
