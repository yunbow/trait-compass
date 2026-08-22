// eval/thresholds.json の読み込みヘルパー(TICKET-0024 の各 eval モジュールが共有する)。
// しきい値を1ファイルに集約することで、CI のゲート条件を変更する際に eval/*.eval.ts を
// 触らずに済むようにする。

import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THRESHOLDS_PATH = path.join(HERE, "..", "thresholds.json");

export interface Thresholds {
  retrieval: {
    precisionAtKMin: number;
    recallAtKMin: number;
    mrrMin: number;
  };
  /**
   * 生成ゴールデンデータ(retrieval-golden.generated.json)向けのしきい値。初回はベースライン
   * 記録用であり `npm run eval` の passed 判定には使わない(非ゲート、警告・記録のみ)。
   */
  retrievalGenerated: {
    _comment?: string;
    precisionAtKMin: number;
    municipalityHitRateAtKMin: number;
    recallAtKCappedMin: number;
  };
  generation: {
    faithfulnessMin: number;
  };
  safety: {
    diagnosticLanguageMissesMax: number;
    crisisFalseNegativesMax: number;
    injectionFalseNegativesMax: number;
  };
  /**
   * LLM-as-judge(eval/judge.eval.ts, `EVAL_JUDGE=1` でのみ実行)向けのしきい値。初回は
   * ベースライン記録用であり `npm run eval` の passed 判定には使わない(非ゲート、警告・記録のみ)。
   */
  judge: {
    _comment?: string;
    relevancyAccuracyMin: number;
    faithfulnessSemanticAccuracyMin: number;
    diagnosticSemanticAccuracyMin: number;
  };
}

export function loadThresholds(): Thresholds {
  return JSON.parse(readFileSync(THRESHOLDS_PATH, "utf8")) as Thresholds;
}
