// R2 オブジェクトキーの組み立て(純関数)。
// 生データ(原本)と toMarkdown 整形結果を別プレフィックスで保存し、再取込時に
// 同じキーを上書き(冪等)できるようにする。

import type { ResourceFormat } from "./datasets.config";

/** 原本(CSV/XLSX)の保存先キー。 */
export function buildRawObjectKey(datasetId: string, resourceId: string, format: ResourceFormat): string {
  return `raw/${datasetId}/${resourceId}.${format.toLowerCase()}`;
}

/** Workers AI `toMarkdown` による整形結果の保存先キー。 */
export function buildDerivedMarkdownKey(datasetId: string, resourceId: string): string {
  return `derived/${datasetId}/${resourceId}.md`;
}
