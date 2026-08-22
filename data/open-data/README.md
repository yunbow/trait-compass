# data/open-data/

東京都・国のオープンデータの原本ダウンロードキャッシュ。`data/manual/` の記載内容を裏付け・突合するための参照データであると同時に、`batch/scripts/ingest-open-data.mjs` によってライセンスゲート付きで D1 へ直接投入される経路の入力でもある。ライセンスが `classifyLocalLicense`(`ingest-open-data.mjs`)で `allowed: true` と判定された source のみ `facilities`/`school_registry` へ実データが入り、それ以外(ライセンス未許可・区市町村集計・HTML検索UIのみ等)は `datasets` のメタ情報のみが投入される(license-hold)。実行方法は [`batch/scripts/README.md`](../../batch/scripts/README.md) を参照。

`batch/ingest/` が CKAN 登録データセットを R2 に保存する仕組み(`raw/{datasetId}/{resourceId}.{format}`)と役割は同じだが、こちらはローカル開発・自治体別調査の裏取り用であり、CKAN 未登録の国データソース(学校コード一覧、WAM NET 等)も対象にする点が異なる。

## 構成

```
open-data/
├── sources.yaml          # 出典マニフェスト(データセットごとのURL・ライセンス・粒度・取得方法)。git管理する
└── <source-id>/           # 原本ファイル本体。git管理しない(.gitignore)
    ├── fetch-meta.json     # 直近の fetch-open-data.mjs 実行結果(取得日時・ファイルごとのSHA-256・バイト数)
    ├── <ダウンロードした原本ファイル>  # sources.yaml の files[].filename で保存されるCSV/ZIP等
    └── extracted/          # ZIP(files[].extract: true)を展開した先。<zip名>/ ごとのサブフォルダに分かれる
        └── <zip名>/
```

`<source-id>` は `sources.yaml` の `id` と一致させる(`ingest-open-data.mjs` が参照する `dataset_id`〔`ds-` 接頭〕とは別の値)。`fetch-meta.json`・`extracted/` を含め `<source-id>/` 配下は原本と同様に git管理しない。

## git管理方針

- `sources.yaml` のみコミットする(小さく、再現性の要)。
- 各 `<source-id>/` 配下の原本ファイル(CSV/XLSX/ZIP等)・`fetch-meta.json`・`extracted/` はコミットしない。理由: 東京都・国の一次データを丸ごとリポジトリに複製するとサイズ・鮮度管理(いつの時点の原本か曖昧になる)の両面で問題があるため。`sources.yaml` の情報があれば再ダウンロードで再現できる状態を保つ。
- 例外的に固定データ(テスト用フィクスチャ等)が必要な場合は `batch/ingest/__tests__/fixtures/` に置く既存の流儀に合わせる(ここには置かない)。

## sources.yaml に載せる情報の粒度

「機械可読データが存在する」と確認できたもの(自治体個別調査が必須な情報は `data/manual/` 側で扱う)。各エントリに `already_wired_in_ingest_worker`(`batch/ingest/datasets.config.ts` で既に自動取込済みかどうか)を持たせ、二重実装を避ける。

ライセンスは、個別に一次情報(サイトポリシー・CKAN `package_show` の `license_id`・利用規約ページ等)で確認し、`license`(識別子)・`license_confirmed_at`(確認日)・`license_evidence_url`(根拠URL)として記録している。あわせて `dataset_id`(`ds-` 接頭、D1 `datasets.id` に対応)・`ingest_target`(`facilities`/`school_registry`/`none`のいずれへ投入するか)・`fetch`(`direct`/`skip`)・`files`(取得URLとファイル名の配列)を追加し、`batch/scripts/fetch-open-data.mjs`/`batch/scripts/ingest-open-data.mjs` が直接参照できる形式にしている。ライセンスが開放的でないと判定した場合は `license: none` とし、`ingest_target: none`(または `fetch: skip`)として `datasets` のメタ情報のみを記録する対象にする。
