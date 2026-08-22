# Trait Compass へのコントリビューション

ご協力ありがとうございます。Trait Compass への貢献を歓迎します。

## 貢献の方法

### 不具合報告・改善提案

- [GitHub Issues](https://github.com/yunbow/trait-compass/issues) をご利用ください。
- 不具合は、再現手順・期待する動作・実際の動作・確認した環境を可能な範囲で記載してください。
- 表示文言・アクセシビリティ・支援窓口データの出典についての改善提案も歓迎します。

### Pull Request

1. リポジトリを Fork します。
2. 作業用ブランチを作成します。
3. 変更を実施します。
4. 変更内容が分かるコミットメッセージを付けてコミットします。
5. Pull Request を作成します。

変更の種類に応じて、以下の点にご協力ください。

#### データ修正 PR(支援情報・表示内容の修正)

- 対象例: `app/db/seed/*.sql`(全国共通の制度情報シード)、表示文言、出典リンクの修正。
- 修正の根拠となる一次資料(公式サイト・公的資料の URL 等)を PR の説明に記載してください(後述の fact-guard 方針)。
- 区市町村別の手動調査データ(`data/manual/municipalities/*.yaml`)は本リポジトリに含まれていないため、掲載中の窓口情報の誤りに気づいた場合は PR ではなく [GitHub Issues](https://github.com/yunbow/trait-compass/issues) で出典とあわせてご報告ください。

#### UI・コード PR(機能・画面・内部実装の変更)

- 後述「変更前の確認」の lint / type-check / test を通してください。
- ユーザーに見える文言を追加・変更する場合は、診断・判定を示唆する表現を避けてください(後述「コンテンツ・データについて」参照)。
- 挙動を変更する場合は、対応するテストの追加・更新もあわせてお願いします。

### 開発環境のセットアップ

本プロジェクトは npm workspaces によるモノレポ構成です(`app/`: Next.js アプリ本体、`batch/`: データ取込 Worker)。セットアップ手順の詳細は[docs/usage/local-setup.md](./docs/usage/local-setup.md)を参照してください。

```bash
npm install
cp app/wrangler.toml.example app/wrangler.toml
cp batch/wrangler.ingest.toml.example batch/wrangler.ingest.toml
cp app/.env.example app/.env
docker compose up -d
npm run db:reset:local -w app
npm run dev -w app
```

### 変更前の確認

Pull Request を送る前に、変更したワークスペース(`app`・`batch`)で以下が成功することを確認してください(CIでも同じチェックを実行します)。

```bash
npm run lint --workspace=app
npm run type-check --workspace=app
npm run test --workspace=app
```

`batch` を変更した場合は `--workspace=batch` に置き換えて同様に確認してください。

### コンテンツ・データについて

- 施設名・住所・電話番号等の事実情報は、D1由来の値または一次資料で確認できたものに限ります。推測・捏造による追加は行わないでください(fact-guard 方針)。
- UI上の表示文言に、診断・判定を示唆する表現(「診断」「判定」「あなたは〜です」等)を含めないでください。既存の禁止語リストは[app/src/lib/copy/banned-words.ts](./app/src/lib/copy/banned-words.ts)を参照してください。
- 個人情報・機微情報を新たに収集する変更は行わないでください。プライバシー設計の方針は[docs/designs/technical-overview.md](./docs/designs/technical-overview.md)を参照してください。
- 区市町村別の手動調査データ(`data/manual/municipalities/*.yaml`)は本リポジトリには含まれていません。スキーマは[data/manual/schema/municipality.schema.ts](./data/manual/schema/municipality.schema.ts)で公開しています。

## 行動規範

敬意を持って、建設的に、誰もが参加しやすい態度でご協力ください。
