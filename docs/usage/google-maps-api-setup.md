# Google Maps API キー・マップID 取得手順

本アプリの地図表示(`app/src/features/support/components/MapView.tsx`)は環境変数
`NEXT_PUBLIC_MAP_PROVIDER`で **Google Maps Platform** (`google`) と
**国土地理院タイル** (`gsi`) を切り替えられる。未指定時は `google`。
Google Mapsを使う場合は`@vis.gl/react-google-maps`とAdvanced Markersを使用する。

Advanced Markers(カスタムピンの描画、キーボード操作対応)を使うには、
**APIキーに加えてマップID(Map ID)の発行が必須**。

## 1. 前提

- Google アカウント
- **課金アカウント(クレジットカード登録)**: 無料枠の範囲内でも Google Cloud の
  課金アカウント登録が必須(2025年3月以降、全アカウント共通の $200 無料クレジットは廃止され、
  SKUごとの無料枠に変更されている)。

## 2. 取得手順

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセスし、Google アカウントでログインする。
2. 新規プロジェクトを作成する(または既存プロジェクトを選択する)。
3. 左メニュー「お支払い」からプロジェクトに請求先アカウントをリンクする
   (未作成の場合はクレジットカード情報を登録して新規作成)。
4. 「APIとサービス」→「ライブラリ」から **Maps JavaScript API** を有効化する。
5. 「APIとサービス」→「認証情報」→「認証情報を作成」→「APIキー」でキーを発行する。
6. 発行したキーを**必ず制限する**(手順7参照)。制限をかけないまま公開すると、
   第三者による不正利用で高額請求が発生するリスクがある。
7. キーの制限設定:
   - **アプリケーションの制限**: 「HTTP リファラー(ウェブサイト)」を選択し、
     本番ドメイン(例: `https://<本番ドメイン>/*`)とローカル開発用
     (`http://localhost:3000/*`)を許可リストに追加する。
   - **API の制限**: 「キーを制限」を選択し、Maps JavaScript API のみに絞る。
8. 「お支払い」→「予算とアラート」で**予算アラートを設定する**(想定外の請求を早期検知するため必須)。
9. **マップID(Map ID)の発行**: 「Google Maps Platform」→「Map Management」→
   「マップIDを作成」から新規作成する(無料)。地図の種類は「JavaScript」を選択する。
   Advanced Markers(施設ピン)はこのマップIDが無いと表示されない。

## 3. 料金の目安(2026年時点)

| SKU | 無料枠 | 超過分の料金 |
| --- | --- | --- |
| Maps JavaScript API(Dynamic Maps) | 月10,000回まで無料 | 1,000回あたり $2〜$7 |

- 2025年3月以降、全SKU共通だった月$200無料クレジットは廃止され、SKUごとの無料枠に変わっている。
- 詳細・最新料金は [Google Maps Platform Pricing](https://mapsplatform.google.com/pricing/) を参照。

## 4. このリポジトリでの設定方法

- `NEXT_PUBLIC_MAP_PROVIDER=google`: Google Mapsを使用。下記APIキーとマップIDが必要。
- `NEXT_PUBLIC_MAP_PROVIDER=gsi`: 国土地理院の標準地図タイルを使用。APIキー不要。

- APIキー・マップIDはいずれもブラウザ上で読み込まれる前提(クライアントサイド露出)のため、
  完全な秘匿はできない。**手順7のリファラー制限を必ず設定**した上で、
  `NEXT_PUBLIC_` プレフィックス付きの環境変数として扱う。
  - `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY`
  - `NEXT_PUBLIC_GOOGLE_MAPS_MAP_ID`
- ローカル開発: `.env`(`.env.example` からコピーした個人用ファイル、Git 管理外)に
  上記2つを設定する。`MapView` はどちらか一方でも未設定だと、地図の代わりに
  「Google Mapsの設定が未完了です。」という案内文を表示する(フェイルセーフ、
  ビルドやページ全体を落とさない)。
- 本番投入時は `.env` に直接書かず、Cloudflare Pages/Workers の環境変数設定で注入する
  (既存の `R2_*` シークレットと同じ方針。[local-setup.md](./local-setup.md) 参照)。
  `NEXT_PUBLIC_` 変数はビルド時にクライアントバンドルへ埋め込まれるため、ビルド実行環境
  (CI/`cf:build` を実行するマシン)側に設定が必要(ランタイムの `wrangler secret put` では
  反映されない点に注意)。

## 5. 参考

- [Google Maps Platform Pricing](https://mapsplatform.google.com/pricing/)
- [Google Maps Platform core services pricing list](https://developers.google.com/maps/billing-and-pricing/pricing)
- [Changes to Google Maps Platform automatic volume discounts, monthly credit](https://developers.google.com/maps/billing-and-pricing/faq)
- [@vis.gl/react-google-maps](https://visgl.github.io/react-google-maps/)
- [Advanced Markers](https://developers.google.com/maps/documentation/javascript/advanced-markers/overview)
