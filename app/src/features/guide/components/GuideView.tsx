import { DisclaimerNotice } from "@/components/common/DisclaimerNotice";
import { InfoPageShell } from "@/components/common/InfoPageShell";
import { CONFUSED_TERM_GROUPS } from "@/features/guide/constants/confused-terms";
import { GuideBrowser } from "@/features/guide/components/GuideBrowser";
import type { GuideEntry } from "@/features/guide/components/GuideBrowser";
import { CATEGORY_DESCRIPTIONS } from "@/features/result/constants/category-descriptions";
import { TRAIT_LABELS } from "@/features/result/constants/trait-labels";
import { CATEGORY_LABELS } from "@/features/survey/constants/category-labels";
import { CATEGORY_KEYS, TRAIT_KEYS } from "@/features/survey/schema/question";
import type { TraitKey } from "@/features/survey/schema/question";

const TRAIT_DESCRIPTIONS: Record<TraitKey, string> = {
  ASD:
    "社会的なコミュニケーションや対人関係、限定された興味や反復的な行動などに関する特徴がみられる神経発達症の一つです。Trait Compass が ASD かどうかを判断するものではありません。",
  ADHD:
    "注意の持続や切り替え、衝動のコントロール、落ち着きにくさなどに関する特徴がみられる神経発達症の一つです。Trait Compass が ADHD かどうかを判断するものではありません。",
  LD:
    "知的な能力全体とは別に、読む・書く・計算するなど特定の学習場面でつまずきが出やすい特徴がみられる状態を指す言葉です。Trait Compass が LD（学習障害）かどうかを判断するものではありません。",
  DCD:
    "全身運動や手先の細かな動き、姿勢の保持、道具の扱いなど、体の動かし方に不器用さが出やすい特徴がみられる状態を指す言葉です。Trait Compass が DCD かどうかを判断するものではありません。",
};

function normalizeTraitLabel(label: string): string {
  return label.replace("(", "（").replace(")", "）");
}

interface GuideViewProps {
  /** 遷移元に応じた戻り先(guide/page.tsx が `back` クエリを検証して渡す)。 */
  backHref: string;
  /** 結果画面から開かれた場合は、用語を確認する文脈を先に示す。 */
  isFromResult: boolean;
}

/**
 * 用語の説明(/guide)。旧 /help から移設(ルートのみ変更、内容とアンカー ID は不変)。
 * /help は「使い方」の案内ページとして別途用意している。
 *
 * 検索・カテゴリチップによる絞り込みは状態を持つため `GuideBrowser`(クライアント
 * コンポーネント)に切り出し、このコンポーネント自体はデータの整形とサーバー側の
 * 戻り先解決(`backHref`)に専念する。
 */
export function GuideView({ backHref, isFromResult }: GuideViewProps) {
  const categories: GuideEntry[] = CATEGORY_KEYS.map((category) => ({
    id: category,
    anchorId: `category-${category}`,
    label: CATEGORY_LABELS[category],
    description: CATEGORY_DESCRIPTIONS[category],
  }));
  const traits: GuideEntry[] = TRAIT_KEYS.map((trait) => ({
    id: trait,
    anchorId: `trait-${trait.toLowerCase()}`,
    label: normalizeTraitLabel(TRAIT_LABELS[trait]),
    description: TRAIT_DESCRIPTIONS[trait],
  }));
  const confusedTerms: GuideEntry[] = CONFUSED_TERM_GROUPS.map((group) => ({
    id: group.id,
    anchorId: `confused-${group.id}`,
    label: group.terms,
    description: group.explanation,
  }));

  return (
    <InfoPageShell
      backHref={backHref}
      eyebrow="GLOSSARY"
      title="用語の説明"
      lead="結果画面に出てくる領域名や、発達特性に関連する用語の意味を、日常の困りごとチェックの文脈で説明します。"
      className="max-w-3xl gap-8"
      heroExtra={
        isFromResult && (
          <p className="mt-4 rounded-lg bg-background/80 px-3 py-2 text-sm text-foreground">
            結果に出た言葉は、下の検索やカテゴリから確認できます。
          </p>
        )
      }
    >
      <DisclaimerNotice variant="top" />

      <GuideBrowser categories={categories} traits={traits} confusedTerms={confusedTerms} />
    </InfoPageShell>
  );
}
