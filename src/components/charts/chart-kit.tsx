"use client";

import { BarChart3, Table2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";

/** Categorical slots in fixed order (validated palette, see globals.css). Never cycled. */
export const SERIES = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const;
export const MUTED_SERIES = "var(--chart-muted)";
export const GRID = "var(--chart-grid)";
export const AXIS_TICK = { fontSize: 12, fill: "var(--muted-foreground)" } as const;

export interface LegendItem {
  label: string;
  color: string;
  kind?: "line" | "dashed" | "rect";
}

/** Legend mirrors the mark: a stroke for lines, a rect for bars/areas. */
export function ChartLegend({ items, className }: { items: LegendItem[]; className?: string }) {
  return (
    <ul className={cn("flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-muted-foreground", className)}>
      {items.map((it) => (
        <li key={it.label} className="flex items-center gap-1.5">
          {it.kind === "rect" ? (
            <span className="size-2.5 rounded-[3px]" style={{ background: it.color }} aria-hidden="true" />
          ) : (
            <svg width="16" height="6" aria-hidden="true">
              <line x1="1" y1="3" x2="15" y2="3" stroke={it.color} strokeWidth="2" strokeLinecap="round" strokeDasharray={it.kind === "dashed" ? "3 3" : undefined} />
            </svg>
          )}
          <span className="text-foreground/80">{it.label}</span>
        </li>
      ))}
    </ul>
  );
}

export interface TooltipRow {
  name: string;
  value: string;
  color?: string;
  dashed?: boolean;
}

/** Tooltip: values lead (strong), series names follow; rows keyed by a short stroke. */
export function TooltipCard({ title, rows }: { title?: ReactNode; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-xl border bg-popover px-3 py-2.5 text-xs shadow-lift">
      {title && <p className="mb-1.5 font-medium text-muted-foreground">{title}</p>}
      <ul className="space-y-1">
        {rows.map((r) => (
          <li key={r.name} className="flex items-center gap-2">
            {r.color && (
              <svg width="12" height="6" aria-hidden="true" className="shrink-0">
                <line x1="1" y1="3" x2="11" y2="3" stroke={r.color} strokeWidth="2.5" strokeLinecap="round" strokeDasharray={r.dashed ? "2 2" : undefined} />
              </svg>
            )}
            <span className="num text-sm font-semibold text-foreground">{r.value}</span>
            <span className="ml-auto pl-3 text-muted-foreground">{r.name}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Recharts tooltip payload (the subset we use). */
export interface TipPayload {
  name?: string | number;
  value?: number | string | (number | string)[];
  color?: string;
  stroke?: string;
  fill?: string;
  dataKey?: string | number | ((obj: unknown) => unknown);
  payload?: Record<string, unknown>;
  strokeDasharray?: string | number;
}

export function ChartCard({
  title,
  insight,
  legend,
  table,
  children,
  className,
  action,
}: {
  title: string;
  /** One plain-language sentence computed from the data. */
  insight?: ReactNode;
  legend?: LegendItem[];
  /** Table-view twin: every value is readable without hovering. */
  table?: { columns: string[]; rows: (string | number)[][] };
  children: ReactNode;
  className?: string;
  action?: ReactNode;
}) {
  const t = useTranslations("chart");
  const [asTable, setAsTable] = useState(false);
  return (
    <Card className={cn("gap-3", className)}>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {insight && <CardDescription className="text-[0.84rem] leading-snug text-foreground/75">{insight}</CardDescription>}
        {(table || action) && (
          <CardAction className="flex items-center gap-1">
            {action}
            {table && (
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setAsTable((v) => !v)}
                aria-pressed={asTable}
                aria-label={asTable ? t("showChart") : t("showTable")}
                title={asTable ? t("showChart") : t("showTable")}
              >
                {asTable ? <BarChart3 /> : <Table2 />}
              </Button>
            )}
          </CardAction>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {legend && legend.length > 1 && !asTable && <ChartLegend items={legend} />}
        {asTable && table ? (
          <div className="max-h-80 overflow-auto rounded-xl border">
            <table className="w-full text-sm">
              <caption className="sr-only">{t("tableCaption", { title })}</caption>
              <thead className="sticky top-0 bg-muted text-xs text-muted-foreground">
                <tr>
                  {table.columns.map((c, i) => (
                    <th key={c} scope="col" className={cn("px-3 py-2 font-medium", i === 0 ? "text-left" : "text-right")}>
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((r, ri) => (
                  <tr key={ri} className="border-t">
                    {r.map((cell, ci) => (
                      <td key={ci} className={cn("px-3 py-1.5", ci === 0 ? "text-left" : "num text-right")}>
                        {cell}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          children
        )}
      </CardContent>
    </Card>
  );
}
