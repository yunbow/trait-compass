import { NextResponse, type NextRequest } from "next/server";

import { createEmbedder } from "@/lib/ai/embedder";
import { isAiFeatureEnabled } from "@/lib/ai/ai-feature-flag";
import { containsPromptInjectionSignal } from "@/lib/ai/injection-detection";
import { createLlmClient } from "@/lib/ai/llm-client";
import { consumeAiRateLimit } from "@/lib/ai/rate-limit";
import { createVectorStore } from "@/lib/ai/vector-store";
import { AI_DISABLED_MESSAGE } from "@/lib/api/ai-error-codes";
import { aiRateLimitedResponse, getDbOrErrorResponse, parseJsonRequest, validatedJsonResponse } from "@/lib/api/route-helpers";

import { containsCrisisSignal } from "@/features/ai-summary/services/crisis-detection";
import { violatesOutputGuard } from "@/features/ai-summary/services/output-guard";
import { CRISIS_GUIDANCE_TEXT } from "@/features/ai-summary/services/prompt";

import {
  RecommendRequestSchema,
  RecommendResponseSchema,
  RECOMMEND_TOP_K,
} from "@/features/recommend/schema/recommend";
import type { RecommendFacility, RecommendResponse } from "@/features/recommend/schema/recommend";
import { containsCausalAssertion, containsFabricatedPhone } from "@/features/recommend/services/fact-guard";
import {
  buildFallbackFacilities,
  reorderFacilitiesByIds,
  toRecommendFacility,
} from "@/features/recommend/services/facility-recommend";
import {
  buildFacilityNotePrompt,
  INJECTION_GUARD_FALLBACK_MESSAGE,
  RECOMMEND_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
} from "@/features/recommend/services/prompt";
import { buildEmbeddingQueryText } from "@/features/recommend/services/query-text";

import {
  BROAD_AREA_MUNICIPALITY,
  fetchFacilitiesByIds,
  isMunicipalityDataMissing,
  MUNICIPALITY_DATA_MISSING_MESSAGE,
  searchFacilitiesWithFreshnessPolicy,
} from "@/features/support/services/facility-search";
import { municipalityToCode } from "@/features/support/constants/municipality-codes";
import type { FacilityRow } from "@/features/support/services/facility-search";
import { queryFacilityIdsAcrossFilters } from "@/features/support/services/facility-vector-search";
import { getUnhealthyDatasets } from "@/features/support/services/dataset-status";

// `/api/recommend`(TICKET-0023)。年齢区分・区市町村・相談分野タグ・相談したい内容の自由文から、
// VectorStore(Vectorize/Qdrant)検索 → D1 JOIN で事実情報を取得 → LlmClient で「合いそうな理由」を
// 短文生成する(FR-042)。状態変更を伴わないが、生成 AI 呼び出しという副作用を持つため
// summarize route と同じく POST のみを受け付ける。
//
// **事実情報の捏造防止(FR-042 AC-2、最重要)**: レスポンスの name/municipality/address/phone/url/
// sourceCredit/sourceUrl はすべて D1(fetchFacilitiesByIds / searchFacilities)由来の値を
// `toRecommendFacility`/`buildFallbackFacilities` でそのまま詰めるのみで、LLM の応答から
// これらの値を抽出・上書きする処理は一切行わない。LLM 応答から採用するのは `aiNote`
// (施設が合いそうな理由の短文)のみであり、事実情報フィールドには一切混ぜない。
//
// **NFR-36(ログ非保存)**: このファイル全体で自由記述(query)・lifestage(元の年齢選択、
// 5区分ライフステージ)・LLM 応答本文・例外詳細を console.log 等に一切出力しない。
//
// グレースフルフォールバック方針(ticket 記載):
// - Embedder/VectorStore が未設定・失敗する場合(ローカルで Qdrant/Ollama 未起動等)、または
//   ベクトル検索がヒットしない・D1 側の絞り込み(is_medical/age/municipality)で全滅した場合は、
//   タグベース検索(searchFacilities、/support/results と同じロジック)に全体をフォールバックし、
//   aiNote は常に null にする(isAiEnabled=false)。
// - Embedder/VectorStore は成功したが個々の施設の LLM 呼び出し・出力ガードが失敗した場合は、
//   取得済みの施設一覧(D1 の事実情報)はそのまま活かし、当該施設の aiNote のみ null にする
//   (部分的縮退。ベクトル検索で得た関連度の高い候補を無駄にしない)。
//
// TICKET-0035: 1 リクエストあたり最大 RECOMMEND_TOP_K 件の LLM 呼び出しが発生するため、
// 原価防衛レート制限の主対象とする。

/**
 * D1側の絞り込み後に RECOMMEND_TOP_K 未満しか残らなかった場合の、追加クエリでの topK 拡大率
 * (2026-08是正)。無制限リトライ・単純な topK 底上げ(全施設インデックスに対して行うと
 * 施設数増加で再発する)は避け、自治体・広域フィルタ済みの母集団に対して1回だけ広く取り直す。
 */
const RAG_RETRY_TOP_K_MULTIPLIER = 3;

/**
 * レスポンスを zod で検証してから返す。検証に失敗した場合(実装バグ等で想定外の形になった
 * 場合)は本文を返さず 500 とする。
 */
function buildValidatedJsonResponse(body: RecommendResponse): NextResponse {
  return validatedJsonResponse(body, RecommendResponseSchema);
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const parsed = await parseJsonRequest(request, RecommendRequestSchema);
  if (!parsed.success) {
    return parsed.response;
  }

  const { query, age, lifestage, municipality: municipalityEntry } = parsed.data;
  const municipality = municipalityEntry.name;
  const tags = parsed.data.tags ?? [];

  const dbResult = getDbOrErrorResponse("施設情報の取得に失敗しました。しばらくしてから再度お試しください。");
  if (!dbResult.ok) return dbResult.response;
  const { db } = dbResult;

  // 危機介入ガード(FR-044): 該当する場合は Embedder/VectorStore/LlmClient を一切呼び出さず、
  // タグベース検索結果(aiNote なし)+ 一般相談窓口案内のみを返す。
  if (containsCrisisSignal(query)) {
    const searchResult = await searchFacilitiesWithFreshnessPolicy(db, { ageGroup: age, municipality, tags, lifestage });
    const facilities = buildFallbackFacilities(searchResult, RECOMMEND_TOP_K);
    return buildValidatedJsonResponse({
      facilities,
      isAiEnabled: false,
      isFallback: searchResult.isFallback,
      fallbackMessage: CRISIS_GUIDANCE_TEXT,
      isCrisisResponse: true,
    });
  }

  // 注入検知ガード(FR-046): 該当する場合は Embedder/VectorStore/LlmClient を一切呼び出さず、
  // タグベース検索結果(aiNote なし)+ 案内文のみを返す(AI キルスイッチ時と同じ非AI縮退)。
  // 危機介入とは別種の縮退のため isCrisisResponse は false のまま。
  if (containsPromptInjectionSignal(query)) {
    const searchResult = await searchFacilitiesWithFreshnessPolicy(db, { ageGroup: age, municipality, tags, lifestage });
    return buildValidatedJsonResponse({
      facilities: buildFallbackFacilities(searchResult, RECOMMEND_TOP_K),
      isAiEnabled: false,
      isFallback: searchResult.isFallback,
      fallbackMessage: INJECTION_GUARD_FALLBACK_MESSAGE,
      isCrisisResponse: false,
    });
  }

  // 危機介入は LLM を使わない定型文でコストが発生しないため、AI 停止中・レート制限中でも
  // 必ず返す(FR-044)。原価防衛ガードは危機介入ガードより後に評価する。
  // AI 機能停止中は Embedder/VectorStore/LlmClient を一切呼ばず、タグベース検索(/support/results と
  // 同じロジック)による非AI体験へ縮退する(TICKET-0035 AC-3/AC-4)。
  if (!isAiFeatureEnabled()) {
    const searchResult = await searchFacilitiesWithFreshnessPolicy(db, { ageGroup: age, municipality, tags, lifestage });
    return buildValidatedJsonResponse({
      facilities: buildFallbackFacilities(searchResult, RECOMMEND_TOP_K),
      isAiEnabled: false,
      isFallback: searchResult.isFallback,
      fallbackMessage: searchResult.fallbackMessage ?? AI_DISABLED_MESSAGE,
      isCrisisResponse: false,
    });
  }
  const rateLimit = await consumeAiRateLimit(request);
  if (!rateLimit.allowed) return aiRateLimitedResponse(rateLimit.retryAfterSeconds);

  // RAG 経路: Embedder → VectorStore → D1 JOIN(facility_id 群からの事実情報再取得)。
  //
  // 2026-08是正(外部コードレビュー指摘): 以前は自治体・年齢のフィルタを一切かけずに
  // 全施設インデックスから topK 件だけ取得していたため、選択自治体に属する施設が
  // 上位 topK に1件も入らないケースが普通にあり(全施設インデックスの母数に対して
  // 特定自治体の割合は小さい)、D1側の絞り込み(自治体・age/lifestage)で全滅→
  // タグベース検索へ丸ごとフォールバック、または一部だけ生き残っても補充されず
  // 少数のまま返る、という問題があった。
  //
  // 対策: VectorStore への問い合わせを「選択自治体」「広域(東京都)」の2フィルタに分け、
  // スコア順にマージする(queryFacilityIdsAcrossFilters)。それでも D1 側の絞り込み後に
  // RECOMMEND_TOP_K 未満しか残らない場合は、既取得分を除いて topK を広げた1回だけの
  // 追加クエリで補充する(無制限リトライはコスト増大につながるため避け、上限1回に固定)。
  let orderedRows: FacilityRow[] = [];
  let usedRag = false;
  try {
    const embedder = createEmbedder();
    const vectorStore = createVectorStore();
    const queryText = buildEmbeddingQueryText(query, tags);
    const filters = [{ municipality }, { municipality: BROAD_AREA_MUNICIPALITY }];

    const facilityIds = await queryFacilityIdsAcrossFilters(
      { text: queryText, topK: RECOMMEND_TOP_K, filters },
      { embedder, vectorStore },
    );

    if (facilityIds.length > 0) {
      const rows = await fetchFacilitiesByIds(db, facilityIds, { ageGroup: age, municipality, lifestage });
      orderedRows = reorderFacilitiesByIds(rows, facilityIds);

      if (orderedRows.length < RECOMMEND_TOP_K) {
        const expandedIds = await queryFacilityIdsAcrossFilters(
          { text: queryText, topK: RECOMMEND_TOP_K * RAG_RETRY_TOP_K_MULTIPLIER, filters },
          { embedder, vectorStore },
        );
        const additionalIds = expandedIds.filter((id) => !facilityIds.includes(id));
        if (additionalIds.length > 0) {
          const additionalRows = await fetchFacilitiesByIds(db, additionalIds, { ageGroup: age, municipality, lifestage });
          const combinedIds = [...facilityIds, ...additionalIds];
          orderedRows = reorderFacilitiesByIds([...rows, ...additionalRows], combinedIds).slice(0, RECOMMEND_TOP_K);
        }
      }

      usedRag = orderedRows.length > 0;
    }

    // 鮮度ポリシー(オープンデータ30日超過・手動調査データ365日超過)。検索結果画面
    // (/support/results)はどちらの由来でも当該施設を広域窓口のみへ縮退表示するため、本APIでも
    // 同じ施設を返すと表示/非表示が食い違ってしまう。以前は kind="manual-expired" のみ除外し、
    // オープンデータ側(kind="open-data-unhealthy")は素通りしていた(2026-08是正、外部コード
    // レビュー指摘)。getUnhealthyDatasets の両kindの集合で除外する(orderedRows が空の場合は
    // 無駄なD1呼び出しを避けるため usedRag のときのみ実行)。
    if (usedRag) {
      const unhealthyDatasets = await getUnhealthyDatasets(db);
      const unhealthyDatasetIds = new Set(
        unhealthyDatasets
          .filter((dataset) => dataset.kind === "manual-expired" || dataset.kind === "open-data-unhealthy")
          .map((dataset) => dataset.id),
      );
      if (unhealthyDatasetIds.size > 0) {
        orderedRows = orderedRows.filter((row) => !unhealthyDatasetIds.has(row.datasetId));
        usedRag = orderedRows.length > 0;
      }
    }
  } catch {
    // NFR-36: Embedder/VectorStore/D1 の例外詳細をログに出力しない。usedRag=false のまま
    // 下のタグベース検索へグレースフルフォールバックする。
    usedRag = false;
  }

  if (!usedRag) {
    const searchResult = await searchFacilitiesWithFreshnessPolicy(db, { ageGroup: age, municipality, tags, lifestage });
    const facilities = buildFallbackFacilities(searchResult, RECOMMEND_TOP_K);
    return buildValidatedJsonResponse({
      facilities,
      isAiEnabled: false,
      isFallback: searchResult.isFallback,
      fallbackMessage: searchResult.fallbackMessage,
      isCrisisResponse: false,
    });
  }

  // 施設ごとに「合いそうな理由」を生成する。個々の生成失敗・出力ガード抵触は当該施設の
  // aiNote を null にするのみで、他の施設・レスポンス全体には影響させない(部分的縮退)。
  const llmClient = createLlmClient();
  const facilities: RecommendFacility[] = await Promise.all(
    orderedRows.map(async (row): Promise<RecommendFacility> => {
      try {
        const result = await llmClient.generate(buildFacilityNotePrompt(query, row), {
          systemInstruction: RECOMMEND_NON_DIAGNOSTIC_SYSTEM_INSTRUCTION,
        });
        const note = result.text;
        // 出力ガード(NFR-51)+ 捏造検知ガード(FR-042 AC-2)+ 因果断定文型ガード
        // (TICKET-0060, SNS-D05)の3段構え。
        const isGuarded =
          violatesOutputGuard(note) || containsFabricatedPhone(note, row.phone) || containsCausalAssertion(note);
        return toRecommendFacility(row, isGuarded ? null : note);
      } catch {
        // NFR-36: 例外詳細をログに出力しない。
        return toRecommendFacility(row, null);
      }
    }),
  );

  const isFallback = isMunicipalityDataMissing(orderedRows, municipalityToCode(municipality) ?? "");

  return buildValidatedJsonResponse({
    facilities,
    isAiEnabled: true,
    isFallback,
    fallbackMessage: isFallback ? MUNICIPALITY_DATA_MISSING_MESSAGE : null,
    isCrisisResponse: false,
  });
}
