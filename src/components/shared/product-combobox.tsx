"use client";

import { Check, ChevronsUpDown } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useLabels } from "@/data/hooks";
import type { ID, Product } from "@/lib/types";
import { cn } from "@/lib/utils";

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

/** Searchable product picker; `hint` shows e.g. the stock available next to each product. */
export function ProductCombobox({
  products,
  value,
  onChange,
  placeholder,
  emptyText,
  hint,
  invalid,
  id,
  disabledIds,
}: {
  products: Product[];
  value: ID | undefined;
  onChange: (id: ID) => void;
  placeholder: string;
  emptyText: string;
  hint?: (p: Product) => React.ReactNode;
  invalid?: boolean;
  id?: string;
  disabledIds?: Set<ID>;
}) {
  const labels = useLabels();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const query = fold(q.trim());
    return products.filter((p) => !query || fold(labels.product(p.id)).includes(query)).slice(0, 60);
  }, [products, q, labels]);
  const selected = value ? products.find((p) => p.id === value) : undefined;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-invalid={invalid || undefined}
          className={cn("w-full min-w-0 justify-between bg-card font-normal", !selected && "text-muted-foreground", invalid && "border-destructive")}
        >
          <span className="truncate">{selected ? labels.product(selected.id) : placeholder}</span>
          <ChevronsUpDown className="opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(420px,calc(100vw-2rem))] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput value={q} onValueChange={setQ} placeholder={placeholder} />
          <CommandList className="max-h-72">
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {list.map((p) => (
                <CommandItem
                  key={p.id}
                  value={p.id}
                  disabled={disabledIds?.has(p.id) && p.id !== value}
                  onSelect={() => {
                    onChange(p.id);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <Check className={cn("size-4", p.id === value ? "opacity-100" : "opacity-0")} />
                  <span className="min-w-0 flex-1 truncate">{labels.product(p.id)}</span>
                  {hint && <span className="num shrink-0 text-xs text-muted-foreground">{hint(p)}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
