"use client";

import { ArrowDownRight, ArrowUpRight, Minus, type LucideIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { Card, CardContent } from "@/components/ui/card";
import { useFormat } from "@/data/hooks";
import { cn } from "@/lib/utils";

/** Minimal sparkline: one hue, 2px line, end dot. Decorative (the values are in the charts/tables). */
export function Sparkline({ values, className, height = 36 }: { values: number[]; className?: string; height?: number }) {
  if (values.length < 2) return <div className={className} style={{ height }} />;
  const w = 120;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, height - 4 - ((v - min) / span) * (height - 8)] as const);
  const d = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const [lx, ly] = pts[pts.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${height}`} preserveAspectRatio="none" className={cn("w-28 overflow-visible", className)} style={{ height }} aria-hidden="true" focusable="false">
      <path d={`${d} L${w},${height} L0,${height} Z`} fill="var(--chart-1)" opacity="0.08" />
      <path d={d} fill="none" stroke="var(--chart-1)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      <circle cx={lx} cy={ly} r="3" fill="var(--chart-1)" stroke="var(--card)" strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

/** ▲ green / ▼ red (inverted when "up" is bad), always with an arrow so colour is not the only cue. */
export function Delta({ delta, invert, period }: { delta: number | null | undefined; invert?: boolean; period?: string }) {
  const f = useFormat();
  const t = useTranslations("dashboard.kpis");
  if (delta === undefined) return <span className="text-xs text-muted-foreground">{t("noComparison")}</span>;
  if (delta === null) return <span className="text-xs text-muted-foreground">— {period && t("vs", { period })}</span>;
  const flat = Math.abs(delta) < 0.005;
  const good = invert ? delta < 0 : delta > 0;
  const Icon = flat ? Minus : delta > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <span
        className={cn(
          "num inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold",
          flat ? "bg-muted text-muted-foreground" : good ? "bg-success/10 text-success-text" : "bg-destructive/10 text-destructive",
        )}
      >
        <Icon className="size-3.5" aria-hidden="true" />
        {f.delta(delta)}
      </span>
      {period && <span className="whitespace-nowrap text-muted-foreground">{t("vs", { period })}</span>}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  delta,
  invert,
  period,
  spark,
  icon: Icon,
  hint,
  hero,
  className,
}: {
  label: string;
  value: string;
  delta?: number | null;
  invert?: boolean;
  period?: string;
  spark: number[];
  icon: LucideIcon;
  hint?: React.ReactNode;
  hero?: boolean;
  className?: string;
}) {
  return (
    <Card className={cn("gap-0 py-4", hero && "bg-gradient-to-br from-card to-accent/60", className)}>
      <CardContent className="flex h-full flex-col gap-2 px-5">
        <div className="flex items-center justify-between gap-2">
          <p className="text-sm font-medium text-muted-foreground">{label}</p>
          <span className="grid size-8 place-items-center rounded-lg bg-accent text-accent-foreground">
            <Icon className="size-4" aria-hidden="true" />
          </span>
        </div>
        <p className={cn("font-semibold tracking-tight text-foreground", hero ? "text-4xl" : "text-2xl")}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
        <div className="mt-auto flex items-end justify-between gap-3 pt-1">
          <div className="shrink-0">
            <Delta delta={delta} invert={invert} period={period} />
          </div>
          <Sparkline values={spark} className={cn("min-w-0 flex-1", hero ? "max-w-56" : "max-w-24")} height={hero ? 48 : 32} />
        </div>
      </CardContent>
    </Card>
  );
}
