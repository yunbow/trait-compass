import type { SupportPathwayStepData } from "@/features/support/services/support-pathway";

/**
 * 「まずすること」(想定ルート)のステップに登場しうる専門用語の対応表。
 * `SupportPathwaySection` が `step.title`/`step.note` を走査し、ここに登録済みの語を
 * 含むステップにのみ「◯◯とは?」の折りたたみ解説を描画する(MVPは2語のみ)。
 *
 * D1由来の想定ルートデータには解説専用のカラムが無いため、テキストマッチ方式で対応する。
 * copy-lint(`src/lib/__tests__/copy-lint.test.ts`)は `.tsx` の JSX リテラルのみを検査し、
 * この `.ts` の静的対応表は対象外になるため、専用の禁止語スキャンテストを別途持つ
 * (`__tests__/pathway-term-glossary.test.ts`)。
 */
export const PATHWAY_TERM_GLOSSARY: Record<string, string> = {
  "特別支援教室": "知的な遅れのない発達障害・情緒障害のある児童生徒が、在籍学級に通いながら週数時間、個別の指導を受ける通級制度です。",
  "受給者証": "児童発達支援・放課後等デイサービス等の利用に必要な証明書です。区市町村への申請・支給決定を経て交付されます。",
};

export interface PathwayTermMatch {
  order: number;
  term: string;
  description: string;
}

/**
 * 想定ルートのステップ(title/note)から、用語集に登録済みの用語を検出する。
 * 同じ用語が複数ステップに登場する場合、初出のステップのみを返す(重複表示防止)。
 */
export function findPathwayTerms(steps: SupportPathwayStepData[]): PathwayTermMatch[] {
  const seen = new Set<string>();
  const matches: PathwayTermMatch[] = [];
  for (const step of steps) {
    for (const term of Object.keys(PATHWAY_TERM_GLOSSARY)) {
      if (seen.has(term)) continue;
      const haystack = `${step.title}${step.note ?? ""}`;
      if (haystack.includes(term)) {
        seen.add(term);
        matches.push({ order: step.order, term, description: PATHWAY_TERM_GLOSSARY[term] });
      }
    }
  }
  return matches;
}
