-- migration 0033: 地域若者サポートステーション2施設(しんじゅく・せたがや)の
-- lifestage_min/lifestage_max を 2(高校生)〜4(社会人)へ是正する。
-- 背景: 対象は「働くことに悩みを抱えている15歳から49歳までの方」(厚生労働省)であり、
-- age_range='both' のみでは未就学児・小学生・中学生の検索にまで表示されてしまっていた
-- (詳細は db/seed/no-diagnosis-facilities.sql の「対象年齢の符号化(2026-08是正)」コメント、
-- および 2026-08-29 コミット 944006f を参照)。
--
-- 位置づけ: 本番D1へは2026-08-29に本ファイルと同内容のUPDATEを手動実行し、既に反映済み
-- (db/seed/no-diagnosis-facilities.sql は当時、素の INSERT のため再実行すると
-- datasets/facilities の主キー衝突で失敗する状態だった。同ファイルは同日付でINSERT ...
-- ON CONFLICT(id) DO UPDATE へ冪等化し、以降は同ファイルの再実行のみで追従できるように
-- 修正済み)。本マイグレーションはその手動反映を正式な記録として残し、本ファイルを未適用の
-- 他環境(他開発者のローカル本番相当D1・将来のステージング環境等)でも同じ状態を再現できる
-- ようにするために追加する。
--
-- 適用(既存環境。本番D1は反映済みのため再実行は必須ではないが、下記のとおり再実行しても
-- 安全):
--   wrangler d1 execute trait-compass --remote --file=./db/migrations/0033-fix-saposute-lifestage.sql
-- ローカルは同コマンド(--local)。db:reset:local(schema.sql フル再適用+
-- db/seed/no-diagnosis-facilities.sql 再投入)を経由した環境では、同シードファイルが既に
-- lifestage_min=2/lifestage_max=4 で投入するため本ファイルは不要(実行しても同値UPDATEのみ)。
--
-- 冪等性: 対象を id で固定した単純な UPDATE のみであり、再実行しても同じ値を設定し直すだけ
-- (冪等)。WHERE 句に現在値との比較を加える等の追加ガードは不要。

UPDATE facilities SET lifestage_min = 2, lifestage_max = 4
WHERE id IN ('fac-manual-saposute-shinjuku', 'fac-manual-saposute-setagaya');
