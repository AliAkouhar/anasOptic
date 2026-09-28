"use client";

import { Check } from "lucide-react";
import type { ReactNode } from "react";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { cn } from "@/lib/utils";

interface ChoiceOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

const ITEM =
  "h-10 rounded-full! border px-4 text-sm font-medium pointer-coarse:h-11 data-[state=on]:border-primary data-[state=on]:bg-primary data-[state=on]:text-primary-foreground hover:data-[state=on]:bg-primary/90 hover:data-[state=on]:text-primary-foreground";

type Props =
  | { multiple?: false; value: string | undefined; onChange: (value: string) => void; allowEmpty?: boolean }
  | { multiple: true; value: string[]; onChange: (value: string[]) => void; allowEmpty?: never };

/** Tappable chips for short single/multi choices (payment method, lens type, treatments…). */
export function ChoiceChips({
  options,
  className,
  label,
  itemClassName,
  ...props
}: Props & { options: ChoiceOption[]; className?: string; itemClassName?: string; label: string }) {
  const items = options.map((o) => (
    <ToggleGroupItem key={o.value} value={o.value} disabled={o.disabled} className={cn(ITEM, itemClassName)} aria-label={typeof o.label === "string" ? o.label : undefined}>
      {props.multiple && Array.isArray(props.value) && props.value.includes(o.value) && <Check className="size-4" aria-hidden="true" />}
      {o.label}
    </ToggleGroupItem>
  ));
  if (props.multiple) {
    return (
      <ToggleGroup type="multiple" variant="outline" spacing={2} value={props.value} onValueChange={props.onChange} className={cn("flex-wrap", className)} aria-label={label}>
        {items}
      </ToggleGroup>
    );
  }
  return (
    <ToggleGroup
      type="single"
      variant="outline"
      spacing={2}
      value={props.value ?? ""}
      onValueChange={(v) => (v || props.allowEmpty ? props.onChange(v) : undefined)}
      className={cn("flex-wrap", className)}
      aria-label={label}
    >
      {items}
    </ToggleGroup>
  );
}
