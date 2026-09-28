"use client";

import { Pencil, Phone, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AXIS_TICK, ChartCard, GRID, SERIES, TooltipCard, type TipPayload } from "@/components/charts/chart-kit";
import { ResteBadge, SegmentBadge, StatusBadge, WhatsAppIcon } from "@/components/shared/badges";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader, Stat } from "@/components/shared/page";
import { useCan, useFormat, useLabels, useOrderScope, useScopedOrderViews } from "@/data/hooks";
import { clientStats, visibleClientIds, type OrderView } from "@/data/indexes";
import { useDbStore } from "@/data/store";
import { Link, useRouter } from "@/i18n/navigation";
import { formatDiopter, formatPhone, shortLocationName, whatsappLink } from "@/lib/format";
import { ClientFormDialog } from "./client-form-dialog";

interface RxPoint {
  at: string;
  label: string;
  sphOd: number | null;
  sphOg: number | null;
  cylOd: number | null;
  cylOg: number | null;
  addOd: number | null;
}

function RxChart({ views }: { views: OrderView[] }) {
  const t = useTranslations("clients");
  const f = useFormat();
  const points = useMemo<RxPoint[]>(
    () =>
      views
        .filter((v) => v.order.status !== "cancelled")
        .sort((a, b) => a.order.createdAt.localeCompare(b.order.createdAt))
        .map((v) => ({
          at: v.order.createdAt,
          label: f.date(v.order.createdAt, "MMM yy"),
          sphOd: v.order.od.sph,
          sphOg: v.order.og.sph,
          cylOd: v.order.od.cyl || null,
          cylOg: v.order.og.cyl || null,
          addOd: v.order.od.add,
        })),
    [views, f],
  );
  const series = [
    { key: "sphOd", label: t("rxSeries.sphOd"), color: SERIES[0], dashed: false },
    { key: "sphOg", label: t("rxSeries.sphOg"), color: SERIES[1], dashed: false },
    { key: "cylOd", label: t("rxSeries.cylOd"), color: SERIES[0], dashed: true },
    { key: "cylOg", label: t("rxSeries.cylOg"), color: SERIES[1], dashed: true },
  ] as const;
  const present = series.filter((s) => points.some((p) => p[s.key] !== null));

  const first = points.find((p) => p.sphOd !== null);
  const last = [...points].reverse().find((p) => p.sphOd !== null);
  const delta = first && last ? (last.sphOd ?? 0) - (first.sphOd ?? 0) : 0;
  const insight =
    points.length < 2 || !first ? undefined : Math.abs(delta) < 0.25 ? t("rxInsightStable") : t("rxInsightChange", { delta: formatDiopter(delta), date: f.date(first.at, "MMMM yyyy") });

  if (points.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("rxTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">{t("noRx")}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <ChartCard
      className="xl:self-start"
      title={t("rxTitle")}
      insight={insight ?? t("rxHint")}
      legend={present.map((s) => ({ label: s.label, color: s.color, kind: s.dashed ? "dashed" : "line" }))}
      table={{
        columns: ["Date", ...present.map((s) => s.label), "ADD"],
        rows: points.map((p) => [f.date(p.at), ...present.map((s) => formatDiopter(p[s.key])), formatDiopter(p.addOd)]),
      }}
    >
      <div className="h-60">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={points} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid stroke={GRID} vertical={false} />
            <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={{ stroke: GRID }} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => formatDiopter(v)} domain={["auto", "auto"]} />
            <ReferenceLine y={0} stroke="var(--border)" />
            <Tooltip
              cursor={{ stroke: "var(--muted-foreground)", strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TooltipCard
                    title={label}
                    rows={(payload as readonly TipPayload[]).map((p) => {
                      const s = series.find((x) => x.key === p.dataKey)!;
                      return { name: s.label, value: formatDiopter(Number(p.value)), color: s.color, dashed: s.dashed };
                    })}
                  />
                ) : null
              }
            />
            {present.map((s) => (
              <Line
                key={s.key}
                dataKey={s.key}
                name={s.label}
                stroke={s.color}
                strokeWidth={2}
                strokeDasharray={s.dashed ? "5 4" : undefined}
                dot={{ r: 4, strokeWidth: 2, fill: "var(--card)" }}
                activeDot={{ r: 5, strokeWidth: 2, stroke: "var(--card)", fill: s.color }}
                connectNulls
                isAnimationActive={false}
              />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </ChartCard>
  );
}

export function ClientDetailPage({ id }: { id: string }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const can = useCan();
  const router = useRouter();
  const db = useDbStore((s) => s.db)!;
  const scope = useOrderScope();
  const allViews = useScopedOrderViews();
  const [editOpen, setEditOpen] = useState(false);
  const client = db.clients.find((c) => c.id === id);
  const visible = useMemo(() => (scope === "none" ? new Set<string>() : visibleClientIds(db, scope)), [db, scope]);
  const views = useMemo(() => allViews.filter((v) => v.order.clientId === id), [allViews, id]);

  if (!client || (visible && !visible.has(client.id))) {
    return (
      <EmptyState
        title={t("common.noResults")}
        body={t("clients.notFound")}
        action={
          <Button asChild variant="outline">
            <Link href="/clients">{t("clients.backToClients")}</Link>
          </Button>
        }
      />
    );
  }

  const stats = clientStats(db, scope === "none" ? [] : scope).get(client.id)!;
  const basket = stats.orderCount ? stats.totalSpent / stats.orderCount : 0;

  const columns: Column<OrderView>[] = [
    {
      id: "number",
      header: t("orders.number"),
      sortValue: (v) => v.order.invoiceNumber,
      cell: (v) => (
        <Link href={`/orders/${v.order.id}`} className="num font-semibold text-primary hover:underline" onClick={(e) => e.stopPropagation()}>
          {v.order.invoiceNumber}
        </Link>
      ),
    },
    { id: "date", header: t("orders.columns.date"), sortValue: (v) => v.order.createdAt, cell: (v) => <span className="num text-muted-foreground">{f.date(v.order.createdAt)}</span> },
    { id: "location", header: t("orders.columns.location"), cell: (v) => shortLocationName(v.location?.name ?? ""), hideBelow: "lg" },
    { id: "status", header: t("orders.columns.status"), cell: (v) => <StatusBadge status={v.order.status} /> },
    { id: "total", header: t("orders.columns.total"), align: "right", sortValue: (v) => v.order.total, cell: (v) => <span className="num font-medium">{f.money(v.order.total)}</span> },
    { id: "reste", header: t("orders.columns.reste"), align: "right", cell: (v) => (v.order.status === "cancelled" ? "—" : <ResteBadge reste={v.reste} compact />) },
  ];

  return (
    <>
      <PageHeader
        backHref="/clients"
        title={client.fullName}
        description={`${t("clients.since", { date: f.date(client.createdAt, "MMMM yyyy") })} · ${t("clients.home", { location: labels.location(client.locationId) })}`}
        actions={
          <>
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil />
              {t("clients.edit")}
            </Button>
            {can("orders.create") && (
              <Button asChild>
                <Link href={`/orders/new?client=${client.id}`}>
                  <Plus />
                  {t("clients.newOrderFor")}
                </Link>
              </Button>
            )}
          </>
        }
      >
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <SegmentBadge segment={stats.segment} />
          <Button asChild variant="outline" size="sm" className="rounded-full">
            <a href={`tel:${client.phone}`} aria-label={t("clients.call")}>
              <Phone />
              <span className="num">{formatPhone(client.phone)}</span>
            </a>
          </Button>
          {client.isWhatsapp && (
            <Button asChild variant="outline" size="sm" className="rounded-full text-whatsapp">
              <a href={whatsappLink(client.phone, `Bonjour ${client.fullName},`)} target="_blank" rel="noopener noreferrer">
                <WhatsAppIcon />
                {t("clients.whatsappChat")}
              </a>
            </Button>
          )}
        </div>
      </PageHeader>

      <Card className="mb-6">
        <CardContent className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          <Stat label={t("clients.kpis.orders")} value={stats.orderCount} />
          <Stat label={t("clients.kpis.spent")} value={f.money(stats.totalSpent)} />
          <Stat label={t("clients.kpis.basket")} value={f.money(Math.round(basket))} />
          <Stat label={t("clients.kpis.lastVisit")} value={stats.lastVisit ? f.date(stats.lastVisit) : "—"} hint={stats.lastVisit ? f.relative(stats.lastVisit) : undefined} />
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <RxChart views={views} />
        <Card className="py-0">
          <CardHeader className="pt-5">
            <CardTitle>{t("clients.ordersTitle")}</CardTitle>
          </CardHeader>
          <DataTable
            rows={views}
            columns={columns}
            rowKey={(v) => v.order.id}
            initialSort={{ id: "date", desc: true }}
            pageSize={8}
            onRowClick={(v) => router.push(`/orders/${v.order.id}`)}
            empty={<p className="px-5 pb-5 text-sm text-muted-foreground">{t("clients.noOrders")}</p>}
            mobileCard={(v) => (
              <Link href={`/orders/${v.order.id}`} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1">
                  <span className="num block font-semibold text-primary">
                    {t("orders.number")} {v.order.invoiceNumber} <span className="text-xs font-normal text-muted-foreground">{f.date(v.order.createdAt)}</span>
                  </span>
                  <StatusBadge status={v.order.status} className="mt-1" />
                </span>
                <span className="num font-medium">{f.money(v.order.total)}</span>
              </Link>
            )}
          />
        </Card>
      </div>
      <ClientFormDialog open={editOpen} onOpenChange={setEditOpen} client={client} />
    </>
  );
}
