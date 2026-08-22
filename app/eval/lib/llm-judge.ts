// LLM-as-judge の共通ヘルパー(TICKET-0024 AC-4)。
//
// `eval/README.md`「実 LLM 導入時の判定規約」の1〜3を実装する:
//   1. temperature = 0 固定(判定結果を再現可能にする)
//   2. Chain-of-Thought(CoT): judge プロンプト側で「まず理由を述べてから結論を出す」ことを
//      明示し、スキーマのフィールド順も reasoning → verdict にする(`buildJudgeSchema` 参照)
//   3. Structured Output 強制: zod スキーマで judge の出力を型として固定し、自由文からの
//      正規表現抽出のような脆い方法で結論を取り出さない
// (4の「複数 judge 多数決」・5の「3段構成」は呼び出し側の `eval/judge.eval.ts` が担う)
//
// **`assertRealLlmProvider()` の意図**: `eval/README.md`「なぜ promptfoo / DeepEval を
// 使わず自前ハーネスにしたか」に記録されているとおり、本チケットは当初「`LlmClient` が
// `mock` 既定の段階では LLM judge を通しても意味のある評価にならない」という理由で
// AC-4 の実装を見送っていた。mock は入力に関わらず固定文言を返すため、judge 経由で
// mock を評価しても常に無意味な結果しか得られない。この関数は、その反省を踏まえた
// 再発防止ガードであり、`LLM_PROVIDER` が実 LLM(`vertex-gateway`/`vertex-direct`)を
// 指していない場合は judge の実行自体を即座に拒否する。

import { z } from "zod";

import { createLlmClient } from "@/lib/ai/llm-client";
import type { LlmResponseSchema } from "@/lib/ai/llm-client";

/**
 * `LLM_PROVIDER` が実 LLM(`vertex-gateway` または `vertex-direct`)を指していない場合、
 * 即座にエラーを投げる(mock 等での無意味な judge 実行を防止する)。
 */
export function assertRealLlmProvider(): void {
  const provider = process.env.LLM_PROVIDER;
  if (provider !== "vertex-gateway" && provider !== "vertex-direct") {
    throw new Error(
      "LLM judge には実 LLM プロバイダーが必要です(LLM_PROVIDER=vertex-gateway または " +
        `vertex-direct を設定してください)。現在の値: ${provider ?? "(未設定、既定は mock)"}。` +
        "mock は入力に関わらず固定文言を返すため、judge を通しても意味のある評価になりません " +
        "(eval/README.md「なぜ promptfoo / DeepEval を使わず自前ハーネスにしたか」参照)。",
    );
  }
}

/** CoT(Chain-of-Thought)を先出しさせるための共通プロンプト指示。各 judge プロンプトの末尾に付与する。 */
export const COT_INSTRUCTION =
  "まず判定の根拠(reasoning)を具体的に述べてから、最後に結論(verdict)を出してください。" +
  "結論だけを述べず、根拠を先に言語化することを必ず守ってください。";

export interface JudgeVerdict<V extends string> {
  reasoning: string;
  verdict: V;
  score?: number;
}

/** judge の Structured Output スキーマ一式(zod スキーマ + Gemini `responseSchema` 相当)。 */
export interface JudgeSchema<V extends string> {
  zodSchema: z.ZodType<JudgeVerdict<V>>;
  geminiSchema: LlmResponseSchema;
}

/**
 * judge の Structured Output スキーマを組み立てる(zod スキーマ + Gemini API
 * `generationConfig.responseSchema` 用の OpenAPI subset オブジェクトの両方)。
 * フィールド順(reasoning → verdict → score)は CoT 先出し規約に対応するため固定する。
 * `propertyOrdering` は Gemini API が Structured Output 生成時の出力順序を制御するために
 * 参照するフィールドで、reasoning を verdict より先に出させる担保になる。
 */
export function buildJudgeSchema<V extends readonly [string, ...string[]]>(
  verdicts: V,
): JudgeSchema<V[number]> {
  const zodSchema: z.ZodType<JudgeVerdict<V[number]>> = z.object({
    reasoning: z.string(),
    verdict: z.enum(verdicts),
    score: z.number().optional(),
  });

  const geminiSchema: LlmResponseSchema = {
    type: "object",
    properties: {
      reasoning: { type: "string" },
      verdict: { type: "string", enum: [...verdicts] },
      score: { type: "number" },
    },
    required: ["reasoning", "verdict"],
    propertyOrdering: ["reasoning", "verdict", "score"],
  };

  return { zodSchema, geminiSchema };
}

/**
 * `runJudge()` の戻り値。判定不能(Structured Output が2回とも zod パースに失敗)の場合も
 * 例外にせず `indeterminate: true` として返す(1ケースの判定不能で評価全体を止めないため)。
 */
export type JudgeResult<V extends string> =
  | { indeterminate: false; value: JudgeVerdict<V> }
  | { indeterminate: true; rawText: string; reason: string };

/**
 * judge プロンプトを実 LLM(Vertex AI Gemini、AI Gateway 経由)に投げ、Structured Output を
 * zod で検証して返す薄いヘルパー。temperature=0 固定。
 *
 * - 呼び出し前に `assertRealLlmProvider()` を必ず通す(mock 等での実行を拒否)。
 * - `createLlmClient("vertex-gateway")` を明示指定する(本番の既定経路、NFR-34 のログ収集
 *   無効化ヘッダー付与を含む `VertexGatewayLlmClient` を使う)。
 * - zod の `safeParse` が失敗した場合は1回だけ再試行し、それでも失敗したら例外にせず
 *   `indeterminate: true` を返す。
 */
export async function runJudge<V extends string>(
  prompt: string,
  schema: JudgeSchema<V>,
): Promise<JudgeResult<V>> {
  assertRealLlmProvider();
  const client = createLlmClient("vertex-gateway");

  const attempt = async (): Promise<
    { success: true; value: JudgeVerdict<V> } | { success: false; rawText: string; reason: string }
  > => {
    const res = await client.generate(prompt, {
      temperature: 0,
      responseSchema: schema.geminiSchema,
    });

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(res.text);
    } catch {
      return { success: false, rawText: res.text, reason: "レスポンスが JSON としてパースできません" };
    }

    const parsed = schema.zodSchema.safeParse(parsedJson);
    if (!parsed.success) {
      return {
        success: false,
        rawText: res.text,
        reason: `zod スキーマ検証に失敗しました: ${parsed.error.message}`,
      };
    }

    return { success: true, value: parsed.data };
  };

  const first = await attempt();
  if (first.success) return { indeterminate: false, value: first.value };

  const second = await attempt();
  if (second.success) return { indeterminate: false, value: second.value };

  return {
    indeterminate: true,
    rawText: second.rawText,
    reason: `1回目: ${first.reason} / 2回目(再試行): ${second.reason}`,
  };
}

/**
 * 同一の判定を複数回(通常はプロンプトを変奏して)実行し、多数決で最終 verdict を決める
 * (README「実 LLM 導入時の判定規約」4: 安全性クリティカルな判定は複数 judge 多数決)。
 * 判定不能(indeterminate)の回は多数決の母数から除外する。全回が判定不能の場合のみ
 * `indeterminate: true` を返す。
 */
export function majorityVote<V extends string>(
  results: readonly JudgeResult<V>[],
): { indeterminate: false; verdict: V; votes: Record<string, number> } | { indeterminate: true } {
  const decided = results.filter(
    (r): r is { indeterminate: false; value: JudgeVerdict<V> } => !r.indeterminate,
  );
  if (decided.length === 0) return { indeterminate: true };

  const votes: Record<string, number> = {};
  for (const r of decided) {
    votes[r.value.verdict] = (votes[r.value.verdict] ?? 0) + 1;
  }

  let winner = decided[0]!.value.verdict;
  let winnerVotes = -1;
  for (const [verdict, count] of Object.entries(votes)) {
    if (count > winnerVotes) {
      winner = verdict as V;
      winnerVotes = count;
    }
  }

  return { indeterminate: false, verdict: winner, votes };
}
