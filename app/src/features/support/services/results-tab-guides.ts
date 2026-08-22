// /support/results タブ別「1分でわかるガイド」の静的コンテンツ。
//
// 【出典・根拠の方針】(procedures-timeline.ts と同一基準)
// - 全国一律・全自治体共通として提示する制度事実は、国(厚生労働省・こども家庭庁)や
//   東京都(東京都福祉局・東京都教育委員会)等の一次情報のみを根拠とする。
//   特定自治体(例: 台東区)のページ・PDFの要約・言い換えを「全自治体共通」の本文として
//   書かない。特定自治体のページは「詳しくはこちら」の参考リンク(sources)として
//   併記するに留める。
// - 【根拠があっても書かないもの】自治体・年度により変わりうる具体的な数値・年度は、
//   heading・keyPoints・body に一切記載しない: 金額(◯円)、負担割合(◯割・◯%)、
//   期間(◯か月)、対象年齢(◯歳)、年度(令和◯年度・◯年度)等。これらに相当する情報は
//   「所得に応じた上限が設けられています」のような制度構造の説明に留め、具体値は
//   「自治体窓口で確認」への誘導で置き換える(procedures-timeline.ts の
//   「期限を書かず窓口確認へ誘導する」基準に合わせる)。
//   この基準は __tests__/results-tab-guides.test.ts の数値・年度パターンスキャンで
//   機械的に強制される。sources の label(文書の正式名称。例:「令和7年4月版」)は
//   文書名そのものであるため例外とし、スキャン対象に含めない。
// - 本ファイルは licenseClassifier.ts(CKAN自動取込パイプラインのライセンス安全網)の
//   対象外であり、validate-manual.mjs(data/manual/ YAML検証)の対象でもない。
//   追記・変更時の安全網は、本コメントの方針の目視レビューと上記回帰テストのみである
//   ことに注意する。

import type { ResultsTab } from "@/features/support/constants/results-tabs";
import type { Lifestage } from "@/features/support/services/lifestage-mapping";

export interface TabGuideSource {
  label: string;
  url?: string;
  confirmedOn: string;
}

export interface TabGuide {
  heading: string;
  /** 開かなくても判断できるように、最初に見せる要点。 */
  keyPoints: readonly { label: string; value: string }[];
  body: readonly string[];
  sources: readonly TabGuideSource[];
}

/** ライフステージごとの「1分でわかるガイド」対応表。未登録タブは持たない(`Partial`)。 */
export type LifestageTabGuides = Partial<Record<ResultsTab, TabGuide>>;

const ELEMENTARY_JUNIOR_HIGH_GUIDES: LifestageTabGuides = {
  学校情報: {
    heading: "学校で受けられる支援を知る",
    keyPoints: [
      { label: "まず相談", value: "担任または特別支援教育コーディネーター" },
      { label: "普段の学級を基本に", value: "一部の時間に個別の指導を受ける方法があります" },
      { label: "確認したいこと", value: "学校で利用できる支援と相談の進め方" },
    ],
    body: [
      "学校での発達面の支援には、いくつかの形があります。「特別支援教室」は、知的な遅れはないものの発達障害・情緒障害があるとされる児童・生徒が対象で、普段は在籍学級で過ごしながら、拠点校の教員が巡回してくる形で一部の時間に、個別の指導計画に沿った指導を受ける仕組みです(通級による指導と同じ制度を指します)。教科の予習・復習ではなく、生活や学習上の困りごとへの対応が中心になります。これとは別に、より長い時間を専用の学級で過ごす「特別支援学級(固定学級)」という枠組みもあり、両者は仕組みが異なります。指導時間や進め方は学校・自治体により異なるため、在籍校で確認してください。",
    ],
    sources: [
      { label: "特別支援教室の運営ガイドライン - 東京都教育委員会", url: "https://www.kyoiku.metro.tokyo.lg.jp/documents/d/kyoiku/01_6", confirmedOn: "2026-08-04" },
    ],
  },
  福祉ガイド: {
    heading: "療育サービスの費用と手続き",
    keyPoints: [
      { label: "費用", value: "世帯の所得に応じた負担上限が設けられています。具体的な金額は自治体窓口でご確認ください" },
      { label: "手続き", value: "相談・見学 → 申請 → 受給者証 → 事業所と契約" },
      { label: "最初の相談先", value: "お住まいの区市町村の障害福祉窓口" },
    ],
    body: [
      "児童発達支援(主に未就学児向け)・放課後等デイサービス(小学校〜高校段階向け)は、いずれも障害児通所支援の制度です。利用者負担には世帯の所得に応じた負担上限月額が設けられており、ひと月の利用量にかかわらず上限を超える負担は生じない仕組みになっています。具体的な負担額・所得区分はお住まいの区市町村の窓口で確認してください。利用開始までは、①申請の準備(必要書類・事業所見学等)、②区市町村窓口での申請・調査、③受給者証の発行、という流れが目安になります。必要書類や日程は自治体ごとに異なるため、窓口で確認してください。",
    ],
    sources: [
      { label: "障害児の利用者負担 - こども家庭庁", url: "https://www.cfa.go.jp/policies/shougaijishien/shisaku/futan", confirmedOn: "2026-08-08" },
      { label: "障害児通所支援事業 利用のてびき(令和7年4月版) - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/service/jidoutusyo.files/202504syougaijitebiki.pdf", confirmedOn: "2026-08-04" },
    ],
  },
  相談窓口: {
    heading: "学校と福祉、どちらに相談するか",
    keyPoints: [
      { label: "学校に相談", value: "授業・休み時間・学習など、学校生活での困りごと" },
      { label: "福祉に相談", value: "療育・放課後の居場所・生活面の支援を探したいとき" },
      { label: "迷ったら", value: "学校と福祉の両方に相談して大丈夫です" },
    ],
    body: [
      "「授業中や休み時間の様子が気になる」「学習の一部に強いつまずきがある」など、学校生活そのものに関わる困りごとは、まず学校のクラス担任・特別支援教育コーディネーターに相談し、必要に応じて特別支援教室(通級)の利用を検討する流れになります。一方、「療育を受けさせたい」「放課後の居場所や生活面の支援を探したい」といった福祉的なサービスの利用は、お住まいの区市町村の障害福祉の窓口への申請が必要です。学校と福祉は別々の申請ルートなので、迷ったときはどちらにも相談してみることをおすすめします。",
    ],
    sources: [
      { label: "障害児通所支援の利用について - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/service/jidoutusyo.html", confirmedOn: "2026-08-04" },
    ],
  },
};

const PRESCHOOL_GUIDES: LifestageTabGuides = {
  相談窓口: {
    heading: "まず誰に相談するか",
    keyPoints: [
      { label: "発達が気になるとき", value: "保健所・保健相談センターの発達相談が入り口になります" },
      { label: "園での困りごとがあるとき", value: "園の先生のほか、区市町村の教育相談窓口を利用できる場合があります" },
      { label: "相談する順番", value: "決まった順序はなく、相談しやすい窓口からで大丈夫です" },
    ],
    body: [
      "「言葉や行動で気になることがある」といった発達の相談は、保健所・保健相談センターの発達相談や、区市町村の療育の相談窓口が入り口になります(対象年齢・受付方法は自治体により異なります)。どこを先に利用すべきかという決まりはなく、相談しやすい窓口から始めて大丈夫です。一方、「集団生活での困りごとがある」など通っている園に関する相談は、園の先生のほか、区市町村の教育相談窓口(幼児を対象に含む自治体があります)も利用できます。",
    ],
    sources: [
      { label: "こども療育室 - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyasisetu/matsugaya_fukushi/kodomoryouiku.html", confirmedOn: "2026-08-01" },
      { label: "発達に心配のある方へ - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/hattatsushinpai/index.html", confirmedOn: "2026-08-01" },
      { label: "教育相談室の概要 - 台東区", url: "https://www.city.taito.lg.jp/kosodatekyouiku/kyoiku/kyouikusienkan/kyouikusoudansitu/kyouikusoudan.html", confirmedOn: "2026-08-01" },
    ],
  },
  福祉ガイド: {
    heading: "児童発達支援の費用と手続き",
    keyPoints: [
      { label: "対象", value: "主に就学前の障害児が対象のサービスです" },
      { label: "費用", value: "世帯の所得に応じた負担上限が設けられています。具体的な金額は自治体窓口でご確認ください" },
      { label: "手続きの流れ", value: "発達相談 → 事業所見学 → 受給者証を申請 → 事業所と契約" },
    ],
    body: [
      "児童発達支援は、障害児通所支援のうち主に就学前の障害児を対象とするサービスです。利用の流れは、①区市町村の発達相談・療育相談の窓口へ相談、②必要に応じて児童発達支援事業所を見学、③利用する事業所と日数を検討、④区市町村の障害児通所支援の窓口で通所受給者証を申請、⑤受給者証交付後に事業所と契約、という順序が目安です。利用者負担には世帯の所得に応じた負担上限月額が設けられており、ひと月の利用量にかかわらず上限を超える負担は生じない仕組みになっています。具体的な負担額・所得区分はお住まいの区市町村の窓口で確認してください。",
    ],
    sources: [
      { label: "障害児の利用者負担 - こども家庭庁", url: "https://www.cfa.go.jp/policies/shougaijishien/shisaku/futan", confirmedOn: "2026-08-08" },
      { label: "こども療育室 - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyasisetu/matsugaya_fukushi/kodomoryouiku.html", confirmedOn: "2026-08-01" },
      { label: "障害児通所支援の利用について - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/service/jidoutusyo.html", confirmedOn: "2026-08-01" },
      { label: "障害者自立支援センター - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyasisetu/matsugaya_fukushi/jiritsushien.html", confirmedOn: "2026-08-01" },
      { label: "障害児通所支援事業 利用のてびき(令和7年4月版) - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/service/jidoutusyo.files/202504syougaijitebiki.pdf", confirmedOn: "2026-08-01" },
    ],
  },
};

const HIGH_SCHOOL_GUIDES: LifestageTabGuides = {
  学校情報: {
    heading: "在籍する高校でも通級指導を受けられる場合がある",
    keyPoints: [
      { label: "まず相談", value: "在籍している高校の先生(担任等)" },
      { label: "都立高校の体制", value: "通級による指導を実施できる仕組みが整えられています。実施状況は在籍校でご確認ください" },
      { label: "相談のタイミング", value: "入学後に高校の先生へ相談する流れです" },
    ],
    body: [
      "小・中学校の「特別支援教室」とは異なり、高校生はすでに高校に在籍しています。都立高校では、通級による指導を実施できる仕組みが整えられており、在籍している高校でも、授業のほかに個別の指導を受けられる場合があります。実施状況・利用の条件は学校により異なるため、利用を希望する場合は、入学後に高校の先生(担任等)へ相談するところから始まります。",
    ],
    sources: [
      { label: "東京都の発達障害教育(令和6年度印刷物登録第35号) - 東京都教育委員会", url: "https://www.kyoiku.metro.tokyo.lg.jp/documents/d/kyoiku/leaflet_2", confirmedOn: "2026-08-04" },
    ],
  },
  相談窓口: {
    heading: "進路・学校生活の相談と、福祉サービスの相談は窓口が異なります",
    keyPoints: [
      { label: "進路・学校生活の相談", value: "在籍する高校の先生(担任等)や、区市町村の教育相談窓口へ" },
      { label: "福祉サービスの相談", value: "放課後等デイサービス等は、区市町村の障害児通所支援の窓口へ" },
      { label: "迷ったら", value: "両方に相談してみて大丈夫です" },
    ],
    body: [
      "「進路のことや学校生活で気になることを相談したい」場合は、在籍する高校の先生(担任等)のほか、区市町村の教育相談窓口(対象年齢は自治体により異なります)が入り口になります。一方、「放課後等デイサービスなど福祉サービスについて相談したい」場合は、区市町村の障害児通所支援の窓口への相談・申請が必要です。どちらに相談すればよいか迷うときは、両方に相談してみることをおすすめします。",
    ],
    sources: [
      { label: "発達に心配のある方へ - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/hattatsushinpai/index.html", confirmedOn: "2026-08-01" },
      { label: "教育相談室の概要 - 台東区", url: "https://www.city.taito.lg.jp/kosodatekyouiku/kyoiku/kyouikusienkan/kyouikusoudansitu/kyouikusoudan.html", confirmedOn: "2026-08-01" },
      { label: "障害者自立支援センター - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyasisetu/matsugaya_fukushi/jiritsushien.html", confirmedOn: "2026-08-01" },
    ],
  },
  福祉ガイド: {
    heading: "高校生でも使える福祉サービス",
    keyPoints: [
      { label: "放課後等デイサービス", value: "高校生になっても継続して利用できます" },
      { label: "相談・申込み先", value: "区市町村の障害児通所支援の窓口(継続・新規とも)" },
      { label: "卒業後を見据えて", value: "障害者就労支援の窓口に在学中から相談できる場合があります" },
    ],
    body: [
      "放課後等デイサービスは小学校段階から高校段階まで利用できる制度のため、高校生になっても継続して利用できます。継続利用や新規の相談・申請は、区市町村の障害児通所支援の窓口が担当します。また、卒業後の就労を見据えて、区市町村の障害者就労支援の窓口へ高校生のうちから相談できる場合もあります(対象年齢等は自治体により異なるため、窓口で確認してください)。",
    ],
    sources: [
      { label: "障害児通所支援の利用について - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/service/jidoutusyo.html", confirmedOn: "2026-08-01" },
      { label: "障害者自立支援センター - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyasisetu/matsugaya_fukushi/jiritsushien.html", confirmedOn: "2026-08-01" },
      { label: "台東区障害者就労支援室 - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyanosigoto/syuurousiensitu.html", confirmedOn: "2026-08-01" },
    ],
  },
};

const ADULT_GUIDES: LifestageTabGuides = {
  相談窓口: {
    heading: "大人の発達の相談は、目的に応じて窓口が分かれます",
    keyPoints: [
      { label: "最初の相談先", value: "保健所・保健センターの大人の発達障害に関する相談(事前予約が必要な場合があります)" },
      { label: "本人以外も", value: "家族や職場の関係者からの相談を受け付けている窓口もあります" },
      { label: "その後の流れ", value: "必要に応じて手帳・自立支援医療や就労支援の窓口につながります" },
    ],
    body: [
      "成人の場合、学校のような決まった相談の入り口はないため、まずは保健所・保健センターが実施する大人の発達障害に関する相談を利用するのが基本的な流れです。事前予約の要否や受付方法は窓口により異なり、本人だけでなく家族や職場関係者からの相談を受け付けている窓口もあります。",
      "こうした相談は、困りごとについて話をするための入り口として位置づけられており、相談をきっかけに、精神障害者保健福祉手帳・自立支援医療(精神通院医療)の申請や、障害者就労支援の窓口での就労相談など、必要な制度につながっていきます。",
    ],
    sources: [
      { label: "大人の発達障害個別相談 - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/kenko/kokorotoinochi/hattatusyougai.html", confirmedOn: "2026-08-01" },
    ],
  },
  福祉ガイド: {
    heading: "手帳・自立支援医療・就労支援の全体像",
    keyPoints: [
      { label: "精神障害者保健福祉手帳", value: "申請には所定の診断書が必要。作成時期の要件は申請窓口でご確認ください" },
      { label: "自立支援医療(精神通院医療)", value: "通院医療費の自己負担が軽減されます。手帳がなくても単独で申請可" },
      { label: "就労相談", value: "区市町村の障害者就労支援の窓口へ。手帳がなくても相談できる場合があります" },
    ],
    body: [
      "精神障害者保健福祉手帳の申請窓口は区市町村により異なります(保健所や障害福祉の窓口など)。申請には、精神障害に関する初診日から一定期間が経過した後に作成された診断書が必要とされています。作成時期・有効期間などの具体的な要件は申請窓口で確認してください。自立支援医療(精神通院医療)は精神科等の通院医療費の自己負担を軽減する制度で、負担が過大にならないよう世帯の所得に応じたひと月あたりの上限が設けられています。手帳を先に取得していなくても単独で申請できます。手帳と同時に申請する場合は、診断書を両方の申請に共用できる場合があります。",
      "就労面では、区市町村の障害者就労支援の窓口が入り口になります。障害者手帳(身体・知的・精神)がなくても、医師の発達障害の診断があれば相談できる窓口もあります。ここを起点に、就労移行支援・就労継続支援A型/B型・自立訓練(生活訓練)等の障害福祉サービスにつながります。なお成人の障害福祉サービスの窓口は、障害種別によって分かれている自治体もあります。",
    ],
    sources: [
      { label: "自立支援医療(精神通院医療)について(リーフレット) - 厚生労働省", url: "https://www.mhlw.go.jp/content/001507767.pdf", confirmedOn: "2026-08-08" },
      { label: "精神障害者保健福祉手帳|東京都福祉局", url: "https://www.fukushi.metro.tokyo.lg.jp/shougai/nichijo/seishintetyou/seishintetyou", confirmedOn: "2026-08-08" },
      { label: "精神障害者保健福祉手帳 - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/techo/seisin.html", confirmedOn: "2026-08-01" },
      { label: "自立支援医療費(精神通院医療) - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/iryoujosei/shaji/seisintuuin.html", confirmedOn: "2026-08-01" },
      { label: "台東区障害者就労支援室 - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyanosigoto/syuurousiensitu.html", confirmedOn: "2026-08-01" },
      { label: "就労移行支援 - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyasisetu/20170309003.html", confirmedOn: "2026-08-01" },
      { label: "就労継続支援(B型) - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyasisetu/20170309005.html", confirmedOn: "2026-08-01" },
      { label: "自立訓練(生活訓練) - 台東区", url: "https://www.city.taito.lg.jp/kenkohukusi/shogai/syougaisyasisetu/20170309002.html", confirmedOn: "2026-08-01" },
    ],
  },
};

const RESULTS_TAB_GUIDES_BY_LIFESTAGE: Record<Lifestage, LifestageTabGuides> = {
  preschool: PRESCHOOL_GUIDES,
  "elementary-junior-high": ELEMENTARY_JUNIOR_HIGH_GUIDES,
  "high-school": HIGH_SCHOOL_GUIDES,
  "university-vocational": ADULT_GUIDES,
  "working-adult": ADULT_GUIDES,
};

export function getResultsTabGuide(tab: ResultsTab, lifestage?: Lifestage | null): TabGuide | null {
  return RESULTS_TAB_GUIDES_BY_LIFESTAGE[lifestage ?? "elementary-junior-high"][tab] ?? null;
}
