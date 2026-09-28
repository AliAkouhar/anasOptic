"use client";

import { Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { formatAxis, formatDiopter, parseDecimal } from "@/lib/format";
import type { EyePrescription } from "@/lib/types";
import { cn } from "@/lib/utils";

export type RxField = keyof EyePrescription;
export type Eye = "od" | "og";

export const RX_FIELDS: RxField[] = ["sph", "cyl", "axis", "add"];

const LIMITS: Record<RxField, { min: number; max: number; step: number }> = {
  sph: { min: -20, max: 20, step: 0.25 },
  cyl: { min: -10, max: 10, step: 0.25 },
  axis: { min: 0, max: 180, step: 5 },
  add: { min: 0.25, max: 4, step: 0.25 },
};

export function formatRx(field: RxField, value: number | null): string {
  return field === "axis" ? formatAxis(value) : formatDiopter(value);
}

/** Read-only paper-form table. */
export function PrescriptionTable({ od, og, className }: { od: EyePrescription; og: EyePrescription; className?: string }) {
  const t = useTranslations("rx");
  const td = useTranslations("detail");
  return (
    <div className={cn("overflow-hidden rounded-xl border", className)}>
      <table className="w-full text-sm">
        <caption className="sr-only">{td("prescription")}</caption>
        <thead className="bg-muted/60 text-xs text-muted-foreground">
          <tr>
            <th scope="col" className="w-14 px-3 py-2 text-left font-medium">
              <span className="sr-only">{t("odLong")}</span>
            </th>
            {RX_FIELDS.map((f) => (
              <th key={f} scope="col" className="px-2 py-2 text-right font-medium">
                <abbr title={t(`${f}Long`)} className="no-underline">
                  {t(f)}
                </abbr>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["od", "og"] as const).map((eye) => {
            const rx = eye === "od" ? od : og;
            return (
              <tr key={eye} className="border-t">
                <th scope="row" className="px-3 py-2.5 text-left">
                  <abbr title={t(`${eye}Long`)} className="rounded-md bg-accent px-1.5 py-0.5 text-xs font-bold text-accent-foreground no-underline">
                    {t(eye)}
                  </abbr>
                </th>
                {RX_FIELDS.map((f) => (
                  <td key={f} className={cn("num px-2 py-2.5 text-right font-medium", rx[f] === null && "text-muted-foreground")}>
                    {formatRx(f, rx[f])}
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** One line: "OD −1.25 (−0.50 × 90°) Add +2.00" */
export function prescriptionLine(rx: EyePrescription): string {
  const parts = [formatDiopter(rx.sph)];
  if (rx.cyl) parts.push(`(${formatDiopter(rx.cyl)} × ${formatAxis(rx.axis)})`);
  if (rx.add) parts.push(`Add ${formatDiopter(rx.add)}`);
  return parts.join(" ");
}

function RxInput({
  field,
  eye,
  value,
  onChange,
  invalid,
  describedBy,
}: {
  field: RxField;
  eye: Eye;
  value: number | null;
  onChange: (v: number | null) => void;
  invalid?: boolean;
  describedBy?: string;
}) {
  const t = useTranslations("rx");
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => (value === null ? "" : formatRx(field, value)));
  const [unreadable, setUnreadable] = useState(false);
  const [syncedValue, setSyncedValue] = useState(value);
  const { min, max, step } = LIMITS[field];
  const id = `rx-${eye}-${field}`;

  // Re-format when the value changes from outside (steppers, "Copier OD → OG"), never while typing:
  // rewriting the text on focus would fight the caret/selection.
  if (value !== syncedValue) {
    setSyncedValue(value);
    if (!focused) {
      setText(value === null ? "" : formatRx(field, value));
      setUnreadable(false);
    }
  }

  const bump = (dir: 1 | -1) => {
    let base = value;
    if (base === null) base = field === "add" ? 0.5 : field === "axis" ? (dir > 0 ? -5 : 185) : 0;
    const next = Math.round((base + dir * step) * 100) / 100;
    onChange(Math.min(max, Math.max(min, next)));
  };

  const fieldLabel = t(field);
  const eyeLabel = t(eye);
  return (
    <div className="min-w-0 space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-muted-foreground sm:sr-only">
        {fieldLabel}
        <span className="sr-only"> {t(`${eye}Long`)}</span>
      </label>
      <div
        className={cn(
          "flex h-11 items-stretch overflow-hidden rounded-lg border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 dark:bg-input/30 pointer-coarse:h-12",
          (invalid || unreadable) && "border-destructive ring-3 ring-destructive/20",
        )}
      >
        <button
          type="button"
          tabIndex={-1}
          onClick={() => bump(-1)}
          aria-label={t("decrease", { field: fieldLabel, eye: eyeLabel })}
          className="grid w-9 shrink-0 place-items-center text-muted-foreground hover:bg-muted active:bg-accent pointer-coarse:w-10"
        >
          <Minus className="size-4" />
        </button>
        <input
          id={id}
          type="text"
          inputMode={field === "axis" ? "numeric" : "decimal"}
          autoComplete="off"
          placeholder="—"
          aria-invalid={invalid || unreadable || undefined}
          aria-describedby={describedBy}
          value={text}
          onFocus={(e) => {
            setFocused(true);
            e.target.select();
          }}
          onBlur={() => {
            setFocused(false);
            setText(value === null ? "" : formatRx(field, value));
            setUnreadable(false);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowUp") {
              e.preventDefault();
              bump(1);
            } else if (e.key === "ArrowDown") {
              e.preventDefault();
              bump(-1);
            }
          }}
          onChange={(e) => {
            const raw = e.target.value;
            setText(raw);
            if (raw.trim() === "") {
              setUnreadable(false);
              onChange(null);
              return;
            }
            const n = parseDecimal(raw.replace("°", ""));
            // Keep the last good value while the text cannot be read (e.g. "-1.2-").
            setUnreadable(n === null);
            if (n !== null) onChange(field === "axis" ? Math.round(n) : n);
          }}
          className="num w-full min-w-0 bg-transparent text-center text-base font-semibold outline-none placeholder:font-normal placeholder:text-muted-foreground"
        />
        <button
          type="button"
          tabIndex={-1}
          onClick={() => bump(1)}
          aria-label={t("increase", { field: fieldLabel, eye: eyeLabel })}
          className="grid w-9 shrink-0 place-items-center text-muted-foreground hover:bg-muted active:bg-accent pointer-coarse:w-10"
        >
          <Plus className="size-4" />
        </button>
      </div>
    </div>
  );
}

/**
 * Editable paper-form table: rows OD / OG, columns SPH, CYL, AXE, ADD.
 * On phones each eye becomes a card with a 2×2 grid.
 */
export function PrescriptionEditor({
  value,
  onChange,
  errors,
}: {
  value: { od: EyePrescription; og: EyePrescription };
  onChange: (eye: Eye, rx: EyePrescription) => void;
  errors?: Partial<Record<Eye, Partial<Record<RxField, string>>>>;
}) {
  const t = useTranslations("rx");
  const td = useTranslations("detail");
  return (
    <div className="space-y-3" role="group" aria-label={td("prescription")}>
      <div className="hidden grid-cols-[96px_repeat(4,minmax(0,1fr))] gap-3 px-1 text-xs font-semibold tracking-wide text-muted-foreground uppercase sm:grid">
        <span aria-hidden="true" />
        {RX_FIELDS.map((f) => (
          <span key={f} className="text-center" title={t(`${f}Long`)}>
            {t(f)}
          </span>
        ))}
      </div>
      {(["od", "og"] as const).map((eye) => {
        const rx = value[eye];
        const eyeErrors = errors?.[eye] ?? {};
        const messages = Object.values(eyeErrors).filter(Boolean);
        return (
          <div key={eye} className="space-y-1.5">
            <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-muted/30 p-3 sm:grid-cols-[96px_repeat(4,minmax(0,1fr))] sm:items-end sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
              <div className="col-span-2 flex items-center gap-2 sm:col-span-1 sm:h-11">
                <span className="rounded-lg bg-primary px-2 py-1 text-sm font-bold text-primary-foreground">{t(eye)}</span>
                <span className="text-sm text-muted-foreground sm:text-xs">{t(`${eye}Long`)}</span>
              </div>
              {RX_FIELDS.map((f) => (
                <RxInput
                  key={f}
                  field={f}
                  eye={eye}
                  value={rx[f]}
                  invalid={!!eyeErrors[f]}
                  describedBy={eyeErrors[f] ? `rx-${eye}-errors` : undefined}
                  onChange={(v) => onChange(eye, { ...rx, [f]: v })}
                />
              ))}
            </div>
            {messages.length > 0 && (
              <p id={`rx-${eye}-errors`} className="text-sm text-destructive sm:pl-[108px]">
                {messages.join(" · ")}
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Returns translation keys (rx.errors.*) per eye/field. */
export function validatePrescription(rx: EyePrescription): Partial<Record<RxField, "sphRange" | "cylRange" | "addRange" | "axisRange" | "axisRequired" | "step">> {
  const errors: Partial<Record<RxField, "sphRange" | "cylRange" | "addRange" | "axisRange" | "axisRequired" | "step">> = {};
  const quarter = (n: number) => Math.abs(n * 4 - Math.round(n * 4)) < 1e-6;
  if (rx.sph !== null) {
    if (rx.sph < -20 || rx.sph > 20) errors.sph = "sphRange";
    else if (!quarter(rx.sph)) errors.sph = "step";
  }
  if (rx.cyl !== null) {
    if (rx.cyl < -10 || rx.cyl > 10) errors.cyl = "cylRange";
    else if (!quarter(rx.cyl)) errors.cyl = "step";
  }
  if (rx.add !== null) {
    if (rx.add < 0.25 || rx.add > 4) errors.add = "addRange";
    else if (!quarter(rx.add)) errors.add = "step";
  }
  if (rx.axis !== null && (rx.axis < 0 || rx.axis > 180 || !Number.isInteger(rx.axis))) errors.axis = "axisRange";
  if (rx.cyl && rx.axis === null) errors.axis = "axisRequired";
  return errors;
}
