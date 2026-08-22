/**
 * AI ペルソナ UX テスト(TICKET-0030)の行動パラメータ定義。
 *
 * NFR-76 が要求する4ペルソナ(標準/ADHD 傾向/ASD 傾向/感覚過敏)を、実在当事者を
 * 演じる LLM ではなく「決定的にエンコードした行動パラメータ」として実装する。
 * 理由は再現性・CI 安定性・コストであり、LLM 駆動ペルソナへの拡張は将来的な検討事項とする。
 *
 * 各パラメータは質問インデックス(0-based, P0 出題30問中)を受け取る純関数として定義し、
 * `Math.random()` 等の非決定的な要素は一切使わない(CI 実行のたびに結果が変わらないため)。
 */

export type PersonaKey = "standard" | "adhd" | "asd" | "sensory";

export interface PersonaBehavior {
  key: PersonaKey;
  label: string;
  /** ペルソナの行動特性の説明。レポート(persona-report.json)にもそのまま転記する。 */
  description: string;
  /**
   * 評価観点(AC-2)。NFR-41〜NFR-46(アクセシビリティ)・NFR-76 に基づくチェック項目。
   * 一部は persona-survey.spec.ts 内のアサーションとして自動化し、残りは
   * レポート閲覧者(人間)への確認事項として明文化する。
   */
  evaluationFocus: string[];
  /** 設問 i(0-based)に回答するまでの待機時間(ms)。決定的な関数にする。 */
  answerDelayMs: (questionIndex: number) => number;
  /** 設問 i に回答した直後、いったん「前の質問へ」で戻ってから再度進むかどうか。 */
  shouldGoBack: (questionIndex: number) => boolean;
  /** 設問 i に到達した時点でページをリロードし、中断・再開をシミュレートするかどうか。 */
  shouldInterrupt: (questionIndex: number) => boolean;
  /** `prefers-reduced-motion: reduce` を有効にするかどうか(感覚過敏ペルソナ、NFR-41)。 */
  reducedMotion: boolean;
}

export const PERSONAS: PersonaBehavior[] = [
  {
    key: "standard",
    label: "標準",
    description:
      "特別な行動特性を仮定しない基準ペルソナ。一定のペースで淡々と回答し、戻る操作や中断は行わない。他ペルソナの結果を比較するためのベースライン。",
    evaluationFocus: [
      "回答完走までの基本所要時間・戻る回数がベースラインとして妥当か",
      "設問切替時に見出しへフォーカスが移動し、進捗表示に違和感がないか(NFR-46)",
    ],
    answerDelayMs: () => 40,
    shouldGoBack: () => false,
    shouldInterrupt: () => false,
    reducedMotion: false,
  },
  {
    key: "adhd",
    label: "ADHD 傾向",
    description:
      "回答間隔が不規則(速い/遅いを繰り返す)。読み直し・確認のため「前の質問へ」で戻る操作が多め。途中で1回、ブラウザリロード相当の中断が発生し、再開する。",
    evaluationFocus: [
      "タイムアウト・カウントダウン表示が一切存在しないこと(NFR-42)",
      "進捗表示が画面下部固定の視覚スケールのみで、急かす表現(%数値等)が無いこと(NFR-45)",
      "戻る操作を繰り返しても回答内容・進行位置が破綻しないこと",
      "中断(リロード)後に離脱時と同じ設問位置から再開できること(FR-015)",
    ],
    // 3問周期で「速い・遅い・普通」を繰り返し、間隔の不規則さを表現する。
    answerDelayMs: (i) => (i % 3 === 0 ? 15 : i % 3 === 1 ? 180 : 60),
    // 5問に1回、戻って確認する操作を挟む。
    shouldGoBack: (i) => i > 0 && i % 5 === 2,
    // 30問中1回だけ、中盤で中断(リロード)する。
    shouldInterrupt: (i) => i === 12,
    reducedMotion: false,
  },
  {
    key: "asd",
    label: "ASD 傾向",
    description:
      "各質問をじっくり読んでから回答する(待機時間が長い)。操作は一貫していて戻る・中断は行わない。自由記述は入力せずスキップする。",
    evaluationFocus: [
      "カテゴリ変わり目の変化が事前告知されていること(NFR-43, CategoryTransition)",
      "画面レイアウト・ナビゲーションの位置が最後まで一貫していること(NFR-43)",
      "1画面1指示・選択式優先になっていること(NFR-44)",
    ],
    answerDelayMs: () => 160,
    shouldGoBack: () => false,
    shouldInterrupt: () => false,
    reducedMotion: false,
  },
  {
    key: "sensory",
    label: "感覚過敏",
    description:
      "`prefers-reduced-motion: reduce` を有効にした環境で、低速(待機時間が長い)かつ一貫した操作で回答する。",
    evaluationFocus: [
      "reduced-motion 環境でアニメーションがフェード/不透明度変化のみであること(NFR-41)",
      "スピン・ズーム・パララックス等の過剰なアニメーションが発生しないこと(NFR-41)",
      "reduced-motion 環境でもカテゴリ変わり目トランジションが短縮されつつ機能すること",
    ],
    answerDelayMs: () => 120,
    shouldGoBack: () => false,
    shouldInterrupt: () => false,
    reducedMotion: true,
  },
];
