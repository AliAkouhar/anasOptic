"use client";

import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AXIS_TICK, ChartCard, GRID, MUTED_SERIES, SERIES, TooltipCard, type TipPayload } from "@/components/charts/chart-kit";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFormat, useLabels } from "@/data/hooks";
import { busiestSlot, HEATMAP_HOURS, LEAD_STEPS, percentDelta, type Comparison } from "@/lib/calculations";
import { shortLocationName } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Delta } from "./kpis";
import type { DashboardCore, LocationRow, PeriodMix } from "./use-dashboard";

function useBucketLabel(granularity: DashboardCore["granularity"]) {
  const f = useFormat();
  return (d: Date) =>
    granularity === "hour" ? `${d.getHours()}h` : granularity === "month" ? f.date(d, "MMM yy") : f.date(d, granularity === "week" ? "d MMM" : "d MMM");
}

// ─── Revenue over time ────────────────────────────────────────────────────────

export function RevenueChart({ data, comparison }: { data: DashboardCore; comparison: Comparison }) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const label = useBucketLabel(data.granularity);
  const period = comparison !== "none" ? t(`periods.${comparison}`) : "";
  const rows = data.buckets.map((b, i) => ({
    label: label(b.start),
    current: b.revenue,
    previous: data.prevBuckets ? (data.prevBuckets[i]?.revenue ?? null) : null,
    prevLabel: data.prevBuckets?.[i] ? label(data.prevBuckets[i].start) : "",
  }));
  const best = rows.reduce<(typeof rows)[number] | null>((m, r) => (!m || r.current > m.current ? r : m), null);
  const delta = data.prevKpis ? percentDelta(data.kpis.revenue, data.prevKpis.revenue) : null;
  const insight =
    data.kpis.revenue === 0
      ? t("insights.noData")
      : `${delta !== null && period ? t("insights.revenueUp", { amount: f.money(data.kpis.revenue), delta: f.delta(delta), period }) : t("insights.revenueFlat", { amount: f.money(data.kpis.revenue) })}${
          best && best.current > 0 && rows.length > 2 ? ` ${t("insights.bestBucket", { label: best.label, amount: f.money(best.current) })}` : ""
        }`;
  const legend = [
    { label: t("charts.current"), color: SERIES[0], kind: "line" as const },
    ...(data.prevBuckets ? [{ label: t("charts.comparison", { period }), color: MUTED_SERIES, kind: "dashed" as const }] : []),
  ];
  return (
    <ChartCard
      title={t("charts.revenue")}
      insight={insight}
      legend={legend}
      table={{
        columns: [t("charts.current"), t("kpis.revenue"), ...(data.prevBuckets ? [t("charts.comparison", { period })] : [])],
        rows: rows.map((r) => [r.label, f.money(r.current), ...(data.prevBuckets ? [r.previous === null ? "—" : f.money(r.previous)] : [])]),
      }}
    >
      <div className="h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="rev-fill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} minTickGap={20} interval="preserveStartEnd" />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => f.moneyCompact(v)} />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const row = (payload as readonly TipPayload[])[0].payload as (typeof rows)[number];
                const d = row.previous ? percentDelta(row.current, row.previous) : null;
                return (
                  <TooltipCard
                    title={
                      <span className="flex items-center gap-2">
                        {row.label}
                        {d !== null && <Delta delta={d} />}
                      </span>
                    }
                    rows={[
                      { name: t("charts.current"), value: f.money(row.current), color: SERIES[0] },
                      ...(row.previous !== null ? [{ name: `${row.prevLabel} (${period})`, value: f.money(row.previous), color: MUTED_SERIES, dashed: true }] : []),
                    ]}
                  />
                );
              }}
            />
            {data.prevBuckets && (
              <Line dataKey="previous" stroke={MUTED_SERIES} strokeWidth={2} strokeDasharray="5 4" dot={false} activeDot={false} isAnimationActive={false} connectNulls />
            )}
            <Area
              dataKey="current"
              type="monotone"
              stroke={SERIES[0]}
              strokeWidth={2}
              fill="url(#rev-fill)"
              dot={false}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)", fill: SERIES[0] }}
              isAnimationActive={false}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

// ─── Store comparison ─────────────────────────────────────────────────────────

export function LocationsChart({ data, comparison, showMargins }: { data: { locations: LocationRow[] }; comparison: Comparison; showMargins: boolean }) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const period = comparison !== "none" ? t(`periods.${comparison}`) : "";
  const rows = data.locations.map((l) => ({
    name: shortLocationName(l.location.name),
    revenue: l.kpis.revenue,
    gross: l.kpis.grossMargin,
    net: l.kpis.netMargin,
  }));
  const series: { key: "revenue" | "gross" | "net"; label: string; color: string }[] = [
    { key: "revenue", label: t("kpis.revenue"), color: SERIES[0] },
    ...(showMargins
      ? [
          { key: "gross" as const, label: t("kpis.grossMargin"), color: SERIES[1] },
          { key: "net" as const, label: t("kpis.netMargin"), color: SERIES[2] },
        ]
      : []),
  ];
  const ranking = [...data.locations].filter((l) => l.location.type === "store" || l.kpis.revenue > 0).sort((a, b) => b.kpis.revenue - a.kpis.revenue);
  const leader = ranking[0];
  const insight = !leader || !leader.kpis.revenue
    ? t("insights.noData")
    : leader.delta !== null && period
      ? t("insights.locationLeader", { location: leader.location.name, share: f.percent(leader.share), delta: f.delta(leader.delta), period })
      : t("insights.locationLeaderNoCmp", { location: leader.location.name, share: f.percent(leader.share) });

  return (
    <ChartCard
      title={t("charts.locations")}
      insight={insight}
      legend={series.map((s) => ({ label: s.label, color: s.color, kind: "rect" as const }))}
      table={{
        columns: [t("charts.location"), ...series.map((s) => s.label)],
        rows: rows.map((r) => [r.name, ...series.map((s) => f.money(r[s.key]))]),
      }}
    >
      <div className="h-64">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rows} margin={{ top: 8, right: 8, left: 0, bottom: 0 }} barGap={2} barCategoryGap="22%">
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} tickFormatter={(v: number) => f.moneyCompact(v)} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              cursor={{ fill: "var(--muted)", opacity: 0.6 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={label}
                    rows={(payload as readonly TipPayload[]).map((p) => {
                      const s = series.find((x) => x.key === p.dataKey)!;
                      return { name: s.label, value: f.money(Number(p.value)), color: s.color };
                    })}
                  />
                ) : null
              }
            />
            {series.map((s) => (
              <Bar key={s.key} dataKey={s.key} fill={s.color} radius={[4, 4, 0, 0]} maxBarSize={36} isAnimationActive={false} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <caption className="sr-only">{t("charts.ranking")}</caption>
          <thead className="bg-muted/60 text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-8 px-3 py-2 text-left font-medium">
                {t("charts.rank")}
              </th>
              <th scope="col" className="px-2 py-2 text-left font-medium">
                {t("charts.location")}
              </th>
              <th scope="col" className="px-2 py-2 text-right font-medium">
                {t("kpis.revenue")}
              </th>
              <th scope="col" className="hidden px-2 py-2 text-right font-medium sm:table-cell">
                {t("charts.share")}
              </th>
              {showMargins && (
                <th scope="col" className="hidden px-2 py-2 text-right font-medium md:table-cell">
                  {t("kpis.netMargin")}
                </th>
              )}
              <th scope="col" className="px-3 py-2 text-right font-medium">
                {t("charts.delta")}
              </th>
            </tr>
          </thead>
          <tbody>
            {ranking.map((l, i) => (
              <tr key={l.location.id} className="border-t">
                <td className="num px-3 py-2 font-semibold text-muted-foreground">{i + 1}</td>
                <td className="px-2 py-2 font-medium">{shortLocationName(l.location.name)}</td>
                <td className="num px-2 py-2 text-right">{f.money(l.kpis.revenue)}</td>
                <td className="num hidden px-2 py-2 text-right text-muted-foreground sm:table-cell">{f.percent(l.share)}</td>
                {showMargins && (
                  <td className={cn("num hidden px-2 py-2 text-right md:table-cell", l.kpis.netMargin < 0 && "text-destructive")}>{f.money(Math.round(l.kpis.netMargin))}</td>
                )}
                <td className="px-3 py-2 text-right">{comparison === "none" ? "—" : <Delta delta={l.delta} />}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

// ─── Activity heatmap ─────────────────────────────────────────────────────────

export function ActivityHeatmap({ data }: { data: Pick<PeriodMix, "heatmap" | "heatmapExtended"> }) {
  const t = useTranslations("dashboard");
  const grid = data.heatmap;
  const max = Math.max(1, ...grid.flat());
  const [hover, setHover] = useState<{ day: number; col: number } | null>(null);
  const best = busiestSlot(grid);
  const insight = best
    ? `${t("insights.busiest", { day: t(`weekdays.${best.day}` as "weekdays.0"), from: best.hour, to: best.hour + 2 })}${data.heatmapExtended ? ` ${t("charts.heatmapExtended")}` : ""}`
    : t("insights.noData");
  const cellText = (day: number, col: number) =>
    t("charts.heatmapCell", { day: t(`weekdays.${day}` as "weekdays.0"), hour: HEATMAP_HOURS[col], count: grid[day][col] });
  return (
    <ChartCard
      title={t("charts.heatmap")}
      insight={insight}
      table={{
        columns: [t("charts.day"), ...HEATMAP_HOURS.map((h) => `${h}h`)],
        rows: grid.map((row, d) => [t(`weekdays.${d}` as "weekdays.0"), ...row]),
      }}
    >
      <div className="space-y-2">
        {/* Each cell is a labelled button (hover/focus readout); the table view is the accessible twin. */}
        <div className="grid grid-cols-[2.5rem_repeat(12,minmax(0,1fr))] gap-1" role="group" aria-label={t("charts.heatmap")}>
          <span aria-hidden="true" />
          {HEATMAP_HOURS.map((h) => (
            <span key={h} className="num text-center text-[10px] text-muted-foreground sm:text-xs" aria-hidden="true">
              {h}
            </span>
          ))}
          {grid.map((row, day) => (
            <div key={day} className="contents">
              <span className="self-center text-xs text-muted-foreground" aria-hidden="true">
                {t(`weekdaysShort.${day}` as "weekdaysShort.0")}
              </span>
              {row.map((count, col) => {
                const pct = count === 0 ? 0 : 12 + Math.round((count / max) * 88);
                const on = hover?.day === day && hover.col === col;
                return (
                  <button
                    key={col}
                    type="button"
                    aria-label={cellText(day, col)}
                    onMouseEnter={() => setHover({ day, col })}
                    onMouseLeave={() => setHover(null)}
                    onFocus={() => setHover({ day, col })}
                    onBlur={() => setHover(null)}
                    className={cn("aspect-square min-h-5 rounded-[4px] transition-transform sm:aspect-[1.3]", on && "scale-110 ring-2 ring-foreground/60")}
                    style={{ background: count === 0 ? "var(--muted)" : `color-mix(in oklab, var(--chart-1) ${pct}%, var(--card))` }}
                  />
                );
              })}
            </div>
          ))}
        </div>
        <div className="flex min-h-5 flex-wrap items-center justify-between gap-2 text-xs">
          <span className="font-medium" aria-live="polite">
            {hover ? cellText(hover.day, hover.col) : ""}
          </span>
          <span className="flex items-center gap-2 text-muted-foreground">
            {t("charts.heatmapScale")}
            <span className="h-2.5 w-24 rounded-full" style={{ background: "linear-gradient(90deg, color-mix(in oklab, var(--chart-1) 12%, var(--card)), var(--chart-1))" }} aria-hidden="true" />
          </span>
        </div>
      </div>
    </ChartCard>
  );
}

// ─── Horizontal bar list (direct labels) ──────────────────────────────────────

function BarList({ items }: { items: { label: string; value: number; display: string }[] }) {
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className="space-y-2.5">
      {items.map((i) => (
        <li key={i.label} className="space-y-1">
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="truncate">{i.label}</span>
            <span className="num shrink-0 font-semibold">{i.display}</span>
          </div>
          <div className="h-2 rounded-full bg-muted">
            <div className="h-2 rounded-full bg-chart-1 transition-[width] duration-300" style={{ width: `${(i.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TopProducts({ data }: { data: Pick<PeriodMix, "brands" | "categories" | "frameCount" | "itemCount"> }) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const labels = useLabels();
  const [tab, setTab] = useState<"brands" | "categories">("brands");
  const list = tab === "brands" ? data.brands : data.categories;
  const total = tab === "brands" ? data.frameCount : data.itemCount;
  const top = list[0];
  const insight = !top
    ? t("insights.noData")
    : tab === "brands"
      ? t("insights.topBrand", { brand: labels.option(top.id), share: f.percent(top.count / Math.max(1, total)) })
      : t("insights.topCategory", { category: labels.option(top.id), share: f.percent(top.count / Math.max(1, total)) });
  const items = list.slice(0, 7).map((x) => ({ label: labels.option(x.id), value: x.count, display: t("charts.units", { count: x.count }) }));
  return (
    <ChartCard
      title={t("charts.top")}
      insight={insight}
      action={
        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={tab}
          onValueChange={(v) => v && setTab(v as typeof tab)}
          aria-label={t("charts.top")}
        >
          <ToggleGroupItem value="brands" className="h-8 px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground pointer-coarse:h-10">
            {t("charts.brands")}
          </ToggleGroupItem>
          <ToggleGroupItem value="categories" className="h-8 px-2.5 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground pointer-coarse:h-10">
            {t("charts.categories")}
          </ToggleGroupItem>
        </ToggleGroup>
      }
    >
      {items.length ? <BarList items={items} /> : <p className="text-sm text-muted-foreground">{t("insights.noData")}</p>}
    </ChartCard>
  );
}

// ─── Workshop lead time ───────────────────────────────────────────────────────

const STEP_COLORS = ["var(--status-confirmed)", "var(--status-workshop)", "var(--status-prepared)", "var(--status-in_store)"];

export function LeadTimeChart({ data }: { data: { locations: LocationRow[]; lead: PeriodMix["lead"] } }) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const days = (v: number | null | undefined) => (v === null || v === undefined ? "—" : t("charts.daysValue", { days: f.number(v, 1) }));
  const stepKeys = LEAD_STEPS.map(([from]) => from);
  const rows = data.locations
    .filter((l) => l.location.type === "store")
    .map((l) => ({
      name: shortLocationName(l.location.name),
      ...Object.fromEntries(stepKeys.map((k, i) => [k, Number((l.lead.perStep[i] ?? 0).toFixed(2))])),
    }));
  // The longest *workshop* step (the last step is the client's pick-up delay, not the atelier's).
  const longest = data.lead.perStep.slice(0, 3).reduce<number>((best, v, i) => ((v ?? 0) > (data.lead.perStep[best] ?? 0) ? i : best), 0);
  const insight =
    data.lead.toInStore === null
      ? t("insights.noData")
      : t("insights.leadTime", { days: f.number(data.lead.toInStore, 1), step: t(`charts.leadSteps.${stepKeys[longest]}`) });
  return (
    <ChartCard
      title={t("charts.leadTime")}
      insight={insight}
      legend={stepKeys.map((k, i) => ({ label: t(`charts.leadSteps.${k}`), color: STEP_COLORS[i], kind: "rect" as const }))}
      table={{
        columns: [t("charts.location"), ...stepKeys.map((k) => t(`charts.leadSteps.${k}`))],
        rows: data.locations.filter((l) => l.location.type === "store").map((l) => [shortLocationName(l.location.name), ...l.lead.perStep.map(days)]),
      }}
    >
      <div className="grid gap-5">
        <div style={{ height: Math.max(120, rows.length * 48 + 30) }}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 12, left: 0, bottom: 0 }} barCategoryGap="28%">
              <CartesianGrid stroke={GRID} horizontal={false} />
              <XAxis type="number" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} tickFormatter={(v: number) => `${v} j`} />
              <YAxis type="category" dataKey="name" tick={AXIS_TICK} tickLine={false} axisLine={false} width={64} />
              <Tooltip
                cursor={{ fill: "var(--muted)", opacity: 0.6 }}
                content={({ active, payload, label }) =>
                  active && payload?.length ? (
                    <TooltipCard
                      title={label}
                      rows={(payload as readonly TipPayload[]).map((p) => {
                        const i = stepKeys.indexOf(p.dataKey as (typeof stepKeys)[number]);
                        return { name: t(`charts.leadSteps.${stepKeys[i]}`), value: days(Number(p.value)), color: STEP_COLORS[i] };
                      })}
                    />
                  ) : null
                }
              />
              {stepKeys.map((k, i) => (
                <Bar
                  key={k}
                  dataKey={k}
                  stackId="lead"
                  fill={STEP_COLORS[i]}
                  stroke="var(--card)"
                  strokeWidth={2}
                  radius={i === stepKeys.length - 1 ? [0, 4, 4, 0] : 0}
                  isAnimationActive={false}
                >
                  <LabelList
                    dataKey={k}
                    position="center"
                    formatter={(v: unknown) => (Number(v) >= 0.8 ? f.number(Number(v), 1) : "")}
                    style={{ fill: "#fff", fontSize: 11, fontWeight: 600 }}
                  />
                </Bar>
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
        <dl className="grid grid-cols-2 gap-3">
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">{t("charts.avgToInStore")}</dt>
            <dd className="mt-1 text-2xl font-semibold">{days(data.lead.toInStore)}</dd>
          </div>
          <div className="rounded-xl bg-muted/60 p-3">
            <dt className="text-xs text-muted-foreground">{t("charts.avgToDelivered")}</dt>
            <dd className="mt-1 text-2xl font-semibold">{days(data.lead.toDelivered)}</dd>
          </div>
        </dl>
      </div>
    </ChartCard>
  );
}

// ─── Client segments ──────────────────────────────────────────────────────────

export function SegmentsChart({ data }: { data: Pick<PeriodMix, "segments" | "served" | "returning"> }) {
  const t = useTranslations();
  const f = useFormat();
  const rows = (["new", "regular", "loyal"] as const).map((s, i) => ({ key: s, label: t(`segment.${s}`), value: data.segments[s], color: SERIES[i] }));
  const total = rows.reduce((s, r) => s + r.value, 0);
  const returningShare = data.served ? data.returning / data.served : 0;
  return (
    <ChartCard
      title={t("dashboard.charts.segments")}
      insight={data.served ? t("dashboard.insights.segments", { share: f.percent(returningShare) }) : t("dashboard.insights.noData")}
      table={{ columns: [t("clients.columns.segment"), t("clients.title"), "%"], rows: rows.map((r) => [r.label, r.value, f.percent(total ? r.value / total : 0)]) }}
    >
      <div className="flex flex-col items-center gap-4 sm:flex-row lg:flex-col">
        <div className="relative size-44 shrink-0">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Tooltip
                content={({ active, payload }) =>
                  active && payload?.length ? (
                    <TooltipCard
                      rows={[
                        {
                          name: String((payload as readonly TipPayload[])[0].name),
                          value: `${(payload as readonly TipPayload[])[0].value} · ${f.percent(total ? Number((payload as readonly TipPayload[])[0].value) / total : 0)}`,
                          color: (payload as readonly TipPayload[])[0].payload?.color as string,
                        },
                      ]}
                    />
                  ) : null
                }
              />
              <Pie data={rows} dataKey="value" nameKey="label" innerRadius="62%" outerRadius="100%" paddingAngle={2} cornerRadius={4} stroke="var(--card)" strokeWidth={2} isAnimationActive={false}>
                {rows.map((r) => (
                  <Cell key={r.key} fill={r.color} />
                ))}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
            <div>
              <p className="text-2xl font-semibold">{f.number(data.served)}</p>
              <p className="text-[11px] text-muted-foreground">{t("dashboard.charts.clientsInPeriod")}</p>
            </div>
          </div>
        </div>
        <ul className="w-full space-y-2">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-2 text-sm">
              <span className="size-2.5 rounded-[3px]" style={{ background: r.color }} aria-hidden="true" />
              <span className="flex-1">{r.label}</span>
              <span className="num font-semibold">{r.value}</span>
              <span className="num w-14 text-right text-muted-foreground">{f.percent(total ? r.value / total : 0)}</span>
            </li>
          ))}
          <li className="flex items-center justify-between border-t pt-2 text-sm">
            <span className="text-muted-foreground">{t("dashboard.charts.returning")}</span>
            <span className="num font-semibold">{f.percent(returningShare)}</span>
          </li>
        </ul>
      </div>
    </ChartCard>
  );
}

// ─── Stock value per location ─────────────────────────────────────────────────

export function StockValueChart({ data }: { data: { locations: LocationRow[] } }) {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const rows = useMemo(() => [...data.locations].sort((a, b) => b.stockValue - a.stockValue), [data.locations]);
  const total = rows.reduce((s, r) => s + r.stockValue, 0);
  const top = rows[0];
  return (
    <ChartCard
      title={t("charts.stockValue")}
      insight={top && total ? t("insights.stockValue", { location: top.location.name, share: f.percent(top.stockValue / total), amount: f.money(Math.round(top.stockValue)) }) : t("insights.noData")}
      table={{ columns: [t("charts.location"), t("charts.value")], rows: rows.map((r) => [r.location.name, f.money(Math.round(r.stockValue))]) }}
    >
      <BarList items={rows.map((r) => ({ label: shortLocationName(r.location.name), value: r.stockValue, display: f.money(Math.round(r.stockValue)) }))} />
    </ChartCard>
  );
}
