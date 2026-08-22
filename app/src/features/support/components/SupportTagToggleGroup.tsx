"use client";

import { TagToggleGroup } from "@/components/common/TagToggleGroup";
import { SUPPORT_TAGS } from "@/features/support/services/category-tag-mapping";
import type { SupportTag } from "@/features/support/services/category-tag-mapping";

interface SupportTagToggleGroupProps {
  selectedTags: SupportTag[];
  onToggle: (tag: SupportTag) => void;
  legend: string;
  description?: string;
  disabled?: boolean;
}

/** 相談分野タグを選択する共通のカード型トグルグループ。TagToggleGroup(components/common)に SUPPORT_TAGS を束縛したラッパー。 */
export function SupportTagToggleGroup(props: SupportTagToggleGroupProps) {
  return <TagToggleGroup options={SUPPORT_TAGS} {...props} />;
}
