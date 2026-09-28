"use client";

import { AlertTriangle, ArrowRight, Ban, Banknote, Calculator, Glasses, PiggyBank, ReceiptText, ShoppingBag, TrendingUp, Wallet } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ResteBadge, WhatsAppIcon } from "@/components/shared/badges";
import { LazyMount } from "@/components/shared/lazy-mount";
import { CardsSkeleton, PageHeader } from "@/components/shared/page";
import { useOrderActions, OrderActionsProvider } from "@/components/orders/order-actions";
import { useActiveLocation, useActiveLocations, useCan, useFormat, useLabels, useNow, useRequiredAuth, useSimulatedLoading } from "@/data/hooks";
import { indexById } from "@/data/indexes";
import { useDbStore } from "@/data/store";
import { Link } from "@/i18n/navigation";
import { daysInStatus, percentDelta, type Comparison, type DateRange } from "@/lib/calculations";
import { shortLocationName } from "@/lib/format";
import type { ID } from "@/lib/types";
import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

// The charts module (Recharts) is only downloaded and parsed when a chart section mounts.
const chartLoading = () => <Skeleton className="h-80 w-full rounded-2xl" />;
const RevenueChart = dynamic(() => import("./charts").then((m) => m.RevenueChart), { ssr: false, loading: chartLoading });
const SegmentsChart = dynamic(() => import("./charts").then((m) => m.SegmentsChart), { ssr: false, loading: chartLoading });
const LocationsChart = dynamic(() => import("./charts").then((m) => m.LocationsChart), { ssr: false, loading: chartLoading });
const StockValueChart = dynamic(() => import("./charts").then((m) => m.StockValueChart), { ssr: false, loading: chartLoading });
const TopProducts = dynamic(() => import("./charts").then((m) => m.TopProducts), { ssr: false, loading: chartLoading });
const ActivityHeatmap = dynamic(() => import("./charts").then((m) => m.ActivityHeatmap), { ssr: false, loading: chartLoading });
const LeadTimeChart = dynamic(() => import("./charts").then((m) => m.LeadTimeChart), { ssr: false, loading: chartLoading });
import { DashboardFilters } from "./filter-bar";
import { KpiCard } from "./kpis";
import { getActionLists, getLocationRows, getPeriodMix, useDashboardCore, type ActionLists, type DashboardCore, type Preset } from "./use-dashboard";
import type { DB } from "@/lib/types";

export function DashboardPage() {
  return (
    <OrderActionsProvider>
      <Dashboard />
    </OrderActionsProvider>
  );
}

function Dashboard() {
  const t = useTranslations("dashboard");
  const f = useFormat();
  const can = useCan();
  const auth = useRequiredAuth();
  const db = useDbStore((s) => s.db)!;
  const loading = useSimulatedLoading();
  const now = useNow();
  const [active] = useActiveLocation();
  const allLocations = useActiveLocations();
  // A dashboard role without orders.view_all only sees its own location.
  const available = useMemo(
    () => (can("orders.view_all") ? allLocations : allLocations.filter((l) => l.id === auth.user.locationId)),
    [allLocations, can, auth.user.locationId],
  );
  const [preset, setPreset] = useState<Preset>("thisMonth");
  const [custom, setCustom] = useState<DateRange | undefined>();
  const [comparison, setComparison] = useState<Comparison>("mom");
  const [locationIds, setLocationIds] = useState<ID[]>(() => (active !== "all" && available.some((l) => l.id === active) ? [active] : available.map((l) => l.id)));

  // Follow the topbar selector (adjusting state while rendering, not in an effect).
  const syncKey = `${active}|${available.map((l) => l.id).join(",")}`;
  const [syncedKey, setSyncedKey] = useState(syncKey);
  if (syncKey !== syncedKey) {
    setSyncedKey(syncKey);
    setLocationIds(active !== "all" && available.some((l) => l.id === active) ? [active] : available.map((l) => l.id));
  }

  const data = useDashboardCore(db, { preset, custom, locationIds, comparison, now });
  const showMargins = can("orders.view_costs") && can("charges.view");
  const period = comparison !== "none" ? t(`periods.${comparison}`) : undefined;
  const k = data.kpis;
  const p = data.prevKpis;
  const delta = (cur: number, prev: number | undefined) => (p && prev !== undefined ? percentDelta(cur, prev) : undefined);
  const spark = (key: keyof (typeof data.buckets)[number]) => data.buckets.map((b) => Number(b[key]));

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <DashboardFilters
        preset={preset}
        onPreset={setPreset}
        custom={custom}
        onCustom={setCustom}
        range={data.range}
        prevRange={data.prevRange}
        locations={available}
        locationIds={locationIds}
        onLocations={setLocationIds}
        comparison={comparison}
        onComparison={setComparison}
      />

      {showMargins && k.ordersWithoutCosts > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl border border-attention/30 bg-attention/8 px-4 py-3 text-sm text-attention-text">
          <AlertTriangle className="size-4 shrink-0" aria-hidden="true" />
          <span className="flex-1">{t("incomplete", { count: k.ordersWithoutCosts })}</span>
          <Button asChild size="sm" variant="outline" className="border-attention/40 bg-transparent text-attention-text hover:bg-attention/10">
            <Link href="/charges?tab=orders">
              {t("completeNow")}
              <ArrowRight />
            </Link>
          </Button>
        </div>
      )}

      {loading ? (
        <CardsSkeleton count={7} className="mb-6" />
      ) : (
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiCard
            hero
            className="sm:col-span-2"
            label={t("kpis.revenue")}
            value={f.money(Math.round(k.revenue))}
            delta={delta(k.revenue, p?.revenue)}
            period={period}
            spark={spark("revenue")}
            icon={TrendingUp}
          />
          {showMargins && (
            <>
              <KpiCard
                label={t("kpis.grossMargin")}
                value={f.money(Math.round(k.grossMargin))}
                hint={k.grossRate !== null ? t("kpis.rate", { rate: f.percent(k.grossRate) }) : undefined}
                delta={delta(k.grossMargin, p?.grossMargin)}
                period={period}
                spark={spark("grossMargin")}
                icon={PiggyBank}
              />
              <KpiCard
                label={t("kpis.netMargin")}
                value={f.money(Math.round(k.netMargin))}
                hint={k.netRate !== null ? t("kpis.rate", { rate: f.percent(k.netRate) }) : undefined}
                delta={delta(k.netMargin, p?.netMargin)}
                period={period}
                spark={spark("netMargin")}
                icon={Wallet}
              />
            </>
          )}
          <KpiCard label={t("kpis.orders")} value={f.number(k.orderCount)} delta={delta(k.orderCount, p?.orderCount)} period={period} spark={spark("orders")} icon={ShoppingBag} />
          <KpiCard label={t("kpis.avgBasket")} value={f.money(Math.round(k.avgBasket))} delta={delta(k.avgBasket, p?.avgBasket)} period={period} spark={spark("avgBasket")} icon={ReceiptText} />
          <KpiCard
            label={t("kpis.outstanding")}
            value={f.money(Math.round(k.outstanding))}
            hint={t("kpis.outstandingHint")}
            delta={delta(k.outstanding, p?.outstanding)}
            invert
            period={period}
            spark={spark("outstanding")}
            icon={Banknote}
          />
          <KpiCard
            label={t("kpis.cancellationRate")}
            value={f.percent(k.cancellationRate, 1)}
            hint={t("kpis.cancelledCount", { count: k.cancelledCount })}
            delta={delta(k.cancellationRate, p?.cancellationRate)}
            invert
            period={period}
            spark={spark("cancellationRate")}
            icon={Ban}
          />
        </div>
      )}

      {/* Charts mount as they approach the viewport: the first paint stays light. */}
      <div className="grid gap-6 lg:grid-cols-3">
        <LazyMount minHeight={420} className="lg:col-span-2">
          <RevenueChart data={data} comparison={comparison} />
        </LazyMount>
        <LazyMount minHeight={420}>
          <Section db={db} core={data} render={(s) => <SegmentsChart data={s.mix()} />} />
        </LazyMount>
        <LazyMount minHeight={640} className="lg:col-span-2">
          <Section db={db} core={data} render={(s) => <LocationsChart data={{ locations: s.locations() }} comparison={comparison} showMargins={showMargins} />} />
        </LazyMount>
        <LazyMount minHeight={640} className="flex flex-col gap-6">
          <Section
            db={db}
            core={data}
            render={(s) => (
              <>
                {can("stock.view_all") && <StockValueChart data={{ locations: s.locations() }} />}
                <TopProducts data={s.mix()} />
              </>
            )}
          />
        </LazyMount>
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <LazyMount minHeight={460}>
          <Section db={db} core={data} render={(s) => <ActivityHeatmap data={s.mix()} />} />
        </LazyMount>
        <LazyMount minHeight={460}>
          <Section db={db} core={data} render={(s) => <LeadTimeChart data={{ locations: s.locations(), lead: s.mix().lead }} />} />
        </LazyMount>
      </div>

      <LazyMount minHeight={360} className="mt-6">
        <Section
          db={db}
          core={data}
          render={(s) => (
            <div className="grid gap-6 lg:grid-cols-3">
              <PickupList data={s.lists()} now={now} />
              {showMargins && <NoCostsList data={s.lists()} />}
              {can("stock.view_all") && <LowStockList data={s.lists()} />}
            </div>
          )}
        />
      </LazyMount>
    </>
  );
}

/**
 * Computes a dashboard section only when it renders (inside a LazyMount), through the cached
 * getters, so off-screen charts cost nothing on first load.
 */
function Section({
  db,
  core,
  render,
}: {
  db: DB;
  core: DashboardCore;
  render: (s: { locations: () => ReturnType<typeof getLocationRows>; mix: () => ReturnType<typeof getPeriodMix>; lists: () => ActionLists }) => React.ReactNode;
}) {
  return render({
    locations: () => getLocationRows(db, core),
    mix: () => getPeriodMix(db, core),
    lists: () => getActionLists(db, core.locationIds),
  });
}

function ListCard({ title, icon: Icon, href, count, children }: { title: string; icon: typeof Glasses; href: string; count: number; children: React.ReactNode }) {
  const t = useTranslations("dashboard.lists");
  return (
    <Card className="gap-3">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
          {title}
          <span className="num rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-muted-foreground">{count}</span>
        </CardTitle>
        <CardAction>
          <Button asChild variant="ghost" size="sm">
            <Link href={href}>
              {t("seeAll")}
              <ArrowRight />
            </Link>
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function PickupList({ data, now }: { data: ActionLists; now: Date }) {
  const t = useTranslations();
  const labels = useLabels();
  const actions = useOrderActions();
  const db = useDbStore((s) => s.db)!;
  const clients = indexById(db.clients);
  return (
    <ListCard title={t("dashboard.lists.pickup")} icon={Glasses} href="/orders?view=list&status=in_store" count={data.pickup.length}>
      {data.pickup.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.lists.pickupEmpty")}</p>
      ) : (
        <ul className="-mx-2 divide-y">
          {data.pickup.slice(0, 6).map(({ order, reste, since }) => {
            const client = clients.get(order.clientId);
            const wa = client?.isWhatsapp ? actions.whatsappHref(order.id) : null;
            const days = daysInStatus(since, now);
            return (
              <li key={order.id} className="flex items-center gap-2 px-2 py-2">
                <Link href={`/orders/${order.id}`} className="min-w-0 flex-1 rounded-lg hover:underline">
                  <span className="block truncate text-sm font-medium">{client?.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="num">N° {order.invoiceNumber}</span> · {shortLocationName(labels.location(order.locationId))} ·{" "}
                    <span className={days > 5 ? "font-semibold text-destructive" : undefined}>{t("dashboard.lists.waiting", { count: days })}</span>
                  </span>
                </Link>
                <ResteBadge reste={reste} compact />
                {wa && (
                  <Button asChild variant="ghost" size="icon-sm" className="text-whatsapp" aria-label={`${t("orders.whatsappNotify")} · ${client?.fullName}`}>
                    <a href={wa} target="_blank" rel="noopener noreferrer">
                      <WhatsAppIcon />
                    </a>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </ListCard>
  );
}

function NoCostsList({ data }: { data: ActionLists }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const db = useDbStore((s) => s.db)!;
  const clients = indexById(db.clients);
  return (
    <ListCard title={t("dashboard.lists.noCosts")} icon={Calculator} href="/charges?tab=orders" count={data.noCosts.length}>
      {data.noCosts.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("dashboard.lists.noCostsEmpty")}</p>
      ) : (
        <ul className="-mx-2 divide-y">
          {data.noCosts.slice(0, 6).map((o) => (
            <li key={o.id}>
              <Link href={`/orders/${o.id}#charges`} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{clients.get(o.clientId)?.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    <span className="num">N° {o.invoiceNumber}</span> · {shortLocationName(labels.location(o.locationId))} · {f.date(o.createdAt, "d MMM")}
                  </span>
                </span>
                <span className="num text-sm font-medium">{f.money(o.total)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ListCard>
  );
}

function LowStockList({ data }: { data: ActionLists }) {
  const t = useTranslations("dashboard.lists");
  const labels = useLabels();
  return (
    <ListCard title={t("lowStock")} icon={AlertTriangle} href="/stock" count={data.lowStock.length}>
      {data.lowStock.length === 0 ? (
        <p className="text-sm text-muted-foreground">{t("lowStockEmpty")}</p>
      ) : (
        <ul className="-mx-2 divide-y">
          {data.lowStock.slice(0, 6).map((s) => (
            <li key={`${s.productId}|${s.locationId}`}>
              <Link href={`/stock?product=${s.productId}&location=${s.locationId}`} className="flex items-center gap-2 rounded-lg px-2 py-2 hover:bg-muted/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{labels.product(s.productId)}</span>
                  <span className="block truncate text-xs text-muted-foreground">{labels.location(s.locationId)}</span>
                </span>
                <span className="num rounded-lg bg-destructive/10 px-2 py-0.5 text-xs font-bold text-destructive">{t("left", { count: s.qty, min: s.min })}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </ListCard>
  );
}
