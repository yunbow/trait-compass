// TICKET-0035 AC-3。AI Gateway の支出上限アラートを受けた運用者が手動で "false" に切り替えて
// 再デプロイすることで AI 機能を停止し、非AI体験へ縮退させるためのキルスイッチである。
// wrangler.toml の [vars] に AI_FEATURES_ENABLED = "true" を明記する運用とする([vars] は
// デプロイ時にダッシュボード設定を上書きするため。docs/usage/cloudflare-setup.md §4)。
// 判定方式は wrangler.ingest.toml の EMBEDDINGS_ENABLED / GEOCODING_ENABLED(`!== "true"` で既定 OFF)
// と意図的に逆である。あちらは既定 OFF のオプトイン機能、こちらは既定 ON のキルスイッチであり、
// 厳密 `=== "true"` では環境変数未設定のローカル開発・テスト・プレビューで AI が停止するためである。
// 値が入っている場合は "true" 以外を無効扱いにして、"FALSE"/"0" 等のタイポ時は止まる側へ安全に
// 倒す。停止手順・影響範囲は docs/usage/cloudflare-setup.md §3.2 を参照する。

export function isAiFeatureEnabled(
  raw: string | undefined = process.env.AI_FEATURES_ENABLED,
): boolean {
  if (raw === undefined || raw === "") return true;
  return raw === "true";
}
