// HTML ベースの知識源(hattatsu.go.jp 等、TICKET-0049)→ facility レコードへの正規化ロジック。
//
// `transform.ts`(CSV → facility)と同じ設計方針(純関数、ネットワーク・D1・R2 いずれにも依存しない、
// vitest でテスト可能)を踏襲する。新しい「解説文」専用テーブルは設けず、既存の
// `facilities`(category_type="発達障害支援資料" 等)テーブルへそのまま UPSERT できる形へ変換する。
//
// **現状の接続状況(TICKET-0049 作業ログ)**: この正規化コードはフィクスチャ
// (`__tests__/fixtures/hattatsu-knowledge-sections.json`)に対してテスト済みだが、
// `workers/ingest/workflow.ts` の自動取込ステップには接続していない。hattatsu.go.jp のような
// CKAN 未登録データセット(`datasets.config.ts` の `ckanPackageId: null`)は
// `dataset.frozen || !dataset.ckanPackageId` の判定によりメタ情報のみ記録されるため
// (実データ取得を試みない)、本ファイルの関数は現時点では呼び出されない。将来的に
// HTML 取得ステップ(fetch → セクション抽出 → 本モジュールで正規化 → upsertFacilities)を
// workflow.ts に追加する際の下地として用意する。

import { stableFacilityId } from "./transform";
import type { FacilityCategoryType, NormalizedFacility } from "./transform";
import { BROAD_AREA_MUNICIPALITY_CODE } from "../../app/src/features/support/constants/municipality-codes";

/** HTML ページ1件から抽出した知識セクション(fetch・DOM 解析は呼び出し側の責務)。 */
export interface HtmlKnowledgeSection {
  title: string;
  url: string;
  text: string;
}

/** description の最大文字数。埋め込みテキストの上限(MAX_EMBEDDING_TEXT_LENGTH)よりは十分小さく保つ。 */
export const HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH = 500;

/**
 * `HtmlKnowledgeSection` の配列を facility レコード(`NormalizedFacility`)へ正規化する純関数。
 * `municipality` は既存の広域フォールバック値 '東京都'(db/schema.sql の慣例、FR-022)を用いる。
 * 国データソースは特定の区市町村に紐づかないため、既存の「広域窓口」の枠組みをそのまま再利用する
 * (広域窓口専用テーブルを新設しない、という既存の設計判断を踏襲)。
 *
 * title・text のいずれかが空の行は除外する(`normalizeCsvRow` が名称欠損行を除外するのと同じ方針)。
 */
export function normalizeHtmlKnowledgeSections(
  sections: readonly HtmlKnowledgeSection[],
  datasetId: string,
  defaultCategoryType: FacilityCategoryType,
): NormalizedFacility[] {
  return sections
    .filter((section) => section.title.trim().length > 0 && section.text.trim().length > 0)
    .map((section): NormalizedFacility => {
      const title = section.title.trim();
      const text = section.text.trim();
      const description =
        text.length > HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH
          ? `${text.slice(0, HTML_KNOWLEDGE_DESCRIPTION_MAX_LENGTH)}…`
          : text;

      return {
        id: stableFacilityId(datasetId, section.url),
        datasetId,
        name: title,
        categoryType: defaultCategoryType,
        municipality: "東京都",
        municipalityCode: BROAD_AREA_MUNICIPALITY_CODE,
        address: null,
        phone: null,
        url: section.url,
        ageRange: "both",
        isMedical: false,
        isOutOfScope: false,
        description,
        // HTML 知識源には連絡手段列という概念が無い(解説文コンテンツであり相談窓口ではない)ため
        // 常に null とする(TICKET-0051)。
        contactMethods: null,
        facilitySubtype: null,
        lifestageMin: null,
        lifestageMax: null,
        lat: null,
        lng: null,
        rawJson: JSON.stringify(section),
      };
    });
}
