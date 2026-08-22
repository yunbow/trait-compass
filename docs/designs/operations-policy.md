# 運用ポリシー(誰が・どのくらいの頻度で・何を保証するか)

## 1. 目的

[`./data-governance.md`](./data-governance.md) がコード上の**しくみ**(鮮度判定・訂正報告フロー等)を
説明するのに対し、このページはそのしくみを**誰がどのくらいの頻度で回すか**という運用面を明文化する。
「東京都や他の運営者に引き継げるか」という問いに答えるためのページであり、実装の追加は伴わない。

## 2. 運用体制

| 項目 | 内容 |
| --- | --- |
| データ更新責任者 | 開発チーム CivicUnknot(本リポジトリのメンテナ) |
| 自動データ監視 | オープンデータは週次cron([`data-governance.md`](./data-governance.md) §3)で再取込・死活監視する。結果は取込 Worker の `GET /health` でいつでも確認できる。 |
| 手動データ再確認 | 個別許諾データ(自治体調査YAML)は最大365日ごと(`MANUAL_DATA_VALID_DAYS`)。365日は上限であり、訂正報告や出典URLの変化に気づいた場合は期限内でも随時更新する([`data-governance.md`](./data-governance.md) §3)。 |
| 利用者からの訂正報告への対応 | 日次cronが未対応件数を通知し、開発者が `report-review.mjs` で内容を確認して `status` を更新する([`data-governance.md`](./data-governance.md) §5)。専用の管理UIはなく、対応期限のSLAも定めていない。 |
| 重大な誤情報が疑われる場合 | 専用の一時非表示機能は無いため、確認が取れるまで開発者が `wrangler d1 execute` で該当行を手動で更新・削除する運用で対応する。 |
| サービス停止・長期メンテナンス時 | 本リポジトリの GitHub 上(README・Issues)で告知する。 |
| 自治体データの引き継ぎ | 対象自治体の手動調査データ(`data/manual/municipalities/<コード>.yaml`)・D1(`facilities`/`schools`系テーブル)・各データの出典(`sources`)が単位として揃っているため、YAML一式のエクスポートと D1 の該当行を引き渡すことで移管できる想定である。自動エクスポートツールは現時点では無い。 |

## 3. 本ドキュメントの位置づけ

このページは開発チームの現時点の運用方針であり、法的なSLA(サービスレベル合意)を構成するものではない。
実際の対応可否は個別の状況による。

---
より広い全体像は [technical-overview.md](./technical-overview.md) を、
コード上のしくみは [data-governance.md](./data-governance.md) を参照してください。
