"use client";

import { forwardRef, useState } from "react";
import { useLang } from "@/data/hooks";
import { parseMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function display(value: number | undefined, lang: "fr" | "en") {
  if (value === undefined || Number.isNaN(value)) return "";
  return new Intl.NumberFormat(lang === "fr" ? "fr-FR" : "en-GB", { maximumFractionDigits: 2 }).format(value).replace(/ /g, " ");
}

/** Money field with a DH suffix, numeric keypad and friendly formatting on blur. */
export const MoneyInput = forwardRef<
  HTMLInputElement,
  {
    value: number | undefined;
    onChange: (value: number | undefined) => void;
    id?: string;
    invalid?: boolean;
    size?: "default" | "lg";
    className?: string;
    placeholder?: string;
    "aria-describedby"?: string;
    "aria-label"?: string;
    onBlur?: () => void;
    disabled?: boolean;
  }
>(function MoneyInput({ value, onChange, id, invalid, size = "default", className, placeholder, onBlur, disabled, ...rest }, ref) {
  const lang = useLang();
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => display(value, lang));
  const [unreadable, setUnreadable] = useState(false);
  const [synced, setSynced] = useState({ value, lang });

  // Re-format when the value changes from outside (quick chips, prefill), never while typing:
  // rewriting the text on focus would fight the caret/selection.
  if (value !== synced.value || lang !== synced.lang) {
    setSynced({ value, lang });
    if (!focused) {
      setText(display(value, lang));
      setUnreadable(false);
    }
  }

  return (
    <div
      className={cn(
        "flex w-full items-center rounded-lg border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30",
        size === "lg" ? "h-14 px-4" : "h-10 px-3 pointer-coarse:h-11",
        (invalid || unreadable) && "border-destructive ring-3 ring-destructive/20",
        disabled && "opacity-50",
        className,
      )}
    >
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        disabled={disabled}
        aria-invalid={invalid || unreadable || undefined}
        aria-describedby={rest["aria-describedby"]}
        aria-label={rest["aria-label"]}
        placeholder={placeholder ?? "0"}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          setText(display(value, lang));
          setUnreadable(false);
          onBlur?.();
        }}
        onChange={(e) => {
          const raw = e.target.value.replace(/[^\d.,\s]/g, "");
          setText(raw);
          if (raw.trim() === "") {
            setUnreadable(false);
            onChange(undefined);
            return;
          }
          const n = parseMoney(raw, lang);
          setUnreadable(n === null);
          if (n !== null) onChange(Math.max(0, n));
        }}
        className={cn(
          "num min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground",
          size === "lg" ? "text-2xl font-semibold" : "text-base md:text-sm",
        )}
      />
      <span className={cn("pl-2 font-medium text-muted-foreground", size === "lg" ? "text-lg" : "text-sm")}>DH</span>
    </div>
  );
});
