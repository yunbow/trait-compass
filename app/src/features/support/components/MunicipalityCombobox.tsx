"use client";

import { Combobox } from "@base-ui/react/combobox";
import { Check, ChevronDown, X } from "lucide-react";

import { SELECTABLE_MUNICIPALITY_REGISTRY } from "@/features/support/constants/municipality-registry";

interface MunicipalityComboboxProps {
  value: string;
  onValueChange: (value: string) => void;
  disabled?: boolean;
  inputId?: string;
}

const MUNICIPALITY_ITEMS = SELECTABLE_MUNICIPALITY_REGISTRY.map((entry) => entry.name);

/** 端末固有の長大な native select を避ける、検索可能な区市町村選択。 */
export function MunicipalityCombobox({
  value,
  onValueChange,
  disabled = false,
  inputId = "support-municipality",
}: MunicipalityComboboxProps) {
  return (
    <Combobox.Root
      items={MUNICIPALITY_ITEMS}
      value={value || null}
      onValueChange={(nextValue) => onValueChange(nextValue ?? "")}
      disabled={disabled}
    >
      <Combobox.InputGroup className="relative flex h-12 w-full items-center rounded-lg border border-border bg-white shadow-sm focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-card">
        <Combobox.Input
          id={inputId}
          name="municipality"
          placeholder="区市町村名を検索"
          autoComplete="address-level2"
          className="h-full min-w-0 flex-1 bg-transparent px-3 pr-20 text-base text-foreground outline-none placeholder:text-muted-foreground"
        />
        <div className="absolute inset-y-0 right-1 flex items-center">
          <Combobox.Clear
            aria-label="区市町村の選択をクリア"
            className="flex size-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X aria-hidden="true" className="size-4" />
          </Combobox.Clear>
          <Combobox.Trigger
            aria-label="区市町村の候補を開く"
            className="flex size-10 items-center justify-center rounded-md text-foreground hover:bg-muted"
          >
            <ChevronDown aria-hidden="true" className="size-4" />
          </Combobox.Trigger>
        </div>
      </Combobox.InputGroup>

      <Combobox.Portal>
        <Combobox.Positioner className="z-50 outline-none" sideOffset={4}>
          <Combobox.Popup className="w-[var(--anchor-width)] max-w-[var(--available-width)] rounded-lg border border-border bg-popover text-popover-foreground shadow-lg">
            <Combobox.Empty className="px-3 py-4 text-sm text-muted-foreground">
              該当する区市町村がありません。
            </Combobox.Empty>
            <Combobox.List className="max-h-[min(20rem,var(--available-height))] overflow-y-auto overscroll-contain p-1 outline-none">
              {(item: string) => (
                <Combobox.Item
                  key={item}
                  value={item}
                  className="grid min-h-11 cursor-default grid-cols-[1.25rem_1fr] items-center gap-2 rounded-md px-3 py-2 text-base outline-none data-highlighted:bg-muted"
                >
                  <Combobox.ItemIndicator>
                    <Check aria-hidden="true" className="size-4" />
                  </Combobox.ItemIndicator>
                  <span className="col-start-2">{item}</span>
                </Combobox.Item>
              )}
            </Combobox.List>
          </Combobox.Popup>
        </Combobox.Positioner>
      </Combobox.Portal>
    </Combobox.Root>
  );
}
