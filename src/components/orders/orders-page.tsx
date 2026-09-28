"use client";

import { Download, KanbanSquare, List, Plus, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { startOfMonth, startOfYear, subDays } from "date-fns";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ResteBadge, StatusBadge, WhatsAppIcon } from "@/components/shared/badges";
import { DataTable, downloadCsv, type Column } from "@/components/shared/data-table";
import { useFeedback } from "@/components/shared/feedback";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { LocationSelector } from "@/components/layout/location-selector";
import { useActiveLocation, useCan, useFormat, useLabels, useNow, useRequiredAuth, useScopedOrderViews, useSimulatedLoading } from "@/data/hooks";
import type { OrderView } from "@/data/indexes";
import { Link, useRouter } from "@/i18n/navigation";
import { formatPhone, normalizePhone, shortLocationName } from "@/lib/format";
import { ORDER_STATUSES, type OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OrderActionsProvider } from "./order-actions";
import { OrderBoard } from "./order-board";

type Period = "any" | "7" | "30" | "month" | "year";

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function periodStart(p: Period, now: Date): number {
  if (p === "7") return subDays(now, 7).getTime();
  if (p === "30") return subDays(now, 30).getTime();
  if (p === "month") return startOfMonth(now).getTime();
  if (p === "year") return startOfYear(now).getTime();
  return 0;
}

function FilterToggle({ pressed, onChange, children }: { pressed: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <Toggle
      pressed={pressed}
      onPressedChange={onChange}
      variant="outline"
      className="h-10 rounded-full px-4 data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:text-accent-foreground pointer-coarse:h-11"
    >
      {children}
    </Toggle>
  );
}

export function OrdersPage() {
  return (
    <OrderActionsProvider>
      <OrdersPageInner />
    </OrderActionsProvider>
  );
}

function OrdersPageInner() {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const can = useCan();
  const auth = useRequiredAuth();
  const feedback = useFeedback();
  const router = useRouter();
  const search = useSearchParams();
  const view = search.get("view") === "list" ? "list" : "board";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState<OrderStatus | "all">((search.get("status") as OrderStatus | null) ?? "all");
  const [period, setPeriod] = useState<Period>("any");
  const [resteDue, setResteDue] = useState(false);
  const [costsMissing, setCostsMissing] = useState(false);
  const [showCancelled, setShowCancelled] = useState(false);
  const [activeLocation] = useActiveLocation();
  const views = useScopedOrderViews();
  const loading = useSimulatedLoading();
  const now = useNow();
  const showCosts = can("orders.view_costs");
  const multiLocation = can("orders.view_all") && activeLocation === "all";

  const filtered = useMemo(() => {
    const query = fold(q.trim());
    const digits = normalizePhone(q).replace(/^0/, "");
    const from = periodStart(period, now);
    return views.filter((v) => {
      const o = v.order;
      if (query) {
        const byNumber = /^\d+$/.test(q.trim()) && String(o.invoiceNumber).startsWith(q.trim());
        const byName = v.client && fold(v.client.fullName).includes(query);
        const byPhone = digits.length >= 4 && v.client && normalizePhone(v.client.phone).includes(digits);
        if (!byNumber && !byName && !byPhone) return false;
      }
      if (resteDue && !(v.reste > 0)) return false;
      if (costsMissing && (o.costsCompleted || o.status === "cancelled")) return false;
      if (view === "list") {
        if (status !== "all" && o.status !== status) return false;
        if (from && Date.parse(o.createdAt) < from) return false;
      }
      return true;
    });
  }, [views, q, resteDue, costsMissing, status, period, view, now]);

  const setView = (v: "board" | "list") => router.replace({ pathname: "/orders", query: v === "list" ? { view: "list" } : {} }, { scroll: false });

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
    {
      id: "date",
      header: t("orders.columns.date"),
      sortValue: (v) => v.order.createdAt,
      cell: (v) => <span className="num whitespace-nowrap text-muted-foreground">{f.date(v.order.createdAt, "d MMM yy")}</span>,
    },
    {
      id: "client",
      header: t("orders.columns.client"),
      sortValue: (v) => v.client?.fullName ?? "",
      cell: (v) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{v.client?.fullName}</p>
          <p className="num flex items-center gap-1 text-xs text-muted-foreground">
            {v.client?.isWhatsapp && <WhatsAppIcon className="size-3 text-whatsapp" />}
            {v.client ? formatPhone(v.client.phone) : ""}
          </p>
        </div>
      ),
    },
    ...(multiLocation
      ? [
          {
            id: "location",
            header: t("orders.columns.location"),
            sortValue: (v: OrderView) => v.location?.name ?? "",
            cell: (v: OrderView) => <span className="text-muted-foreground">{shortLocationName(v.location?.name ?? "")}</span>,
            hideBelow: "lg" as const,
          },
        ]
      : []),
    {
      id: "status",
      header: t("orders.columns.status"),
      sortValue: (v) => ORDER_STATUSES.indexOf(v.order.status),
      cell: (v) => <StatusBadge status={v.order.status} />,
    },
    {
      id: "total",
      header: t("orders.columns.total"),
      align: "right",
      sortValue: (v) => v.order.total,
      cell: (v) => <span className="num font-medium">{f.money(v.order.total)}</span>,
    },
    {
      id: "reste",
      header: t("orders.columns.reste"),
      align: "right",
      sortValue: (v) => v.reste,
      cell: (v) => (v.order.status === "cancelled" ? <span className="text-muted-foreground">—</span> : <ResteBadge reste={v.reste} compact />),
    },
    ...(showCosts
      ? [
          {
            id: "costs",
            header: t("orders.columns.costs"),
            align: "center" as const,
            hideBelow: "xl" as const,
            sortValue: (v: OrderView) => Number(v.order.costsCompleted),
            cell: (v: OrderView) =>
              v.order.status === "cancelled" ? null : v.order.costsCompleted ? (
                <span className="text-xs text-success-text">{t("orders.costsDone")}</span>
              ) : (
                <span className="inline-flex items-center gap-1.5 text-xs font-medium text-attention-text">
                  <span className="size-2 rounded-full bg-attention" aria-hidden="true" />
                  {t("orders.costsMissingShort")}
                </span>
              ),
          },
        ]
      : []),
  ];

  const exportCsv = () => {
    const rows = [...filtered]
      .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt))
      .map((v) => [
        v.order.invoiceNumber,
        f.date(v.order.createdAt, "yyyy-MM-dd HH:mm"),
        v.location?.name ?? "",
        v.client?.fullName ?? "",
        v.client ? formatPhone(v.client.phone) : "",
        t(`status.${v.order.status}`),
        v.order.total,
        v.paid,
        v.reste,
        v.order.costsCompleted ? t("common.yes") : t("common.no"),
      ]);
    downloadCsv(`${t("orders.exportName")}-${f.date(new Date(), "yyyy-MM-dd")}`, [
      t("orders.number"),
      t("orders.columns.date"),
      t("orders.columns.location"),
      t("orders.columns.client"),
      t("common.phone"),
      t("orders.columns.status"),
      t("orders.columns.total"),
      t("money.paidAmount"),
      t("orders.columns.reste"),
      t("orders.costsDone"),
    ], rows);
    feedback.success(t("common.exported"));
  };

  const description = auth.user.locationId && !can("orders.view_all")
    ? t("orders.descriptionScoped", { location: labels.location(auth.user.locationId) })
    : t("orders.description");

  return (
    <>
      <PageHeader
        title={t("orders.title")}
        description={description}
        actions={
          <>
            {view === "list" && can("orders.view_all") && (
              <Button variant="outline" onClick={exportCsv} disabled={filtered.length === 0}>
                <Download />
                {t("common.exportCsv")}
              </Button>
            )}
            {can("orders.create") && (
              <Button asChild className="hidden sm:inline-flex">
                <Link href="/orders/new">
                  <Plus />
                  {t("nav.newOrder")}
                </Link>
              </Button>
            )}
          </>
        }
      />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <Tabs value={view} onValueChange={(v) => setView(v as "board" | "list")}>
          <TabsList className="w-full sm:w-auto">
            <TabsTrigger value="board" className="px-4">
              <KanbanSquare />
              {t("orders.board")}
            </TabsTrigger>
            <TabsTrigger value="list" className="px-4">
              <List />
              {t("orders.list")}
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative flex-1 lg:max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t("orders.searchPlaceholder")}
            aria-label={t("orders.searchPlaceholder")}
            className="pl-9"
            type="search"
          />
        </div>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-2">
        {can("orders.view_all") && <LocationSelector className="sm:w-56 md:hidden" />}
        {view === "list" && (
          <>
            <Select value={status} onValueChange={(v) => setStatus(v as OrderStatus | "all")}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("orders.filters.status")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("orders.filters.allStatuses")}</SelectItem>
                {ORDER_STATUSES.map((s) => (
                  <SelectItem key={s} value={s}>
                    {t(`status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("orders.filters.period")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="any">{t("orders.filters.anyDate")}</SelectItem>
                <SelectItem value="7">{t("orders.filters.last7")}</SelectItem>
                <SelectItem value="30">{t("orders.filters.last30")}</SelectItem>
                <SelectItem value="month">{t("orders.filters.thisMonth")}</SelectItem>
                <SelectItem value="year">{t("orders.filters.thisYear")}</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
        <FilterToggle pressed={resteDue} onChange={setResteDue}>
          {t("orders.resteDue")}
        </FilterToggle>
        {showCosts && (
          <FilterToggle pressed={costsMissing} onChange={setCostsMissing}>
            <span className="size-2 rounded-full bg-attention" aria-hidden="true" />
            {t("orders.costsMissing")}
          </FilterToggle>
        )}
        {view === "board" && (
          <FilterToggle pressed={showCancelled} onChange={setShowCancelled}>
            {t("orders.showCancelled")}
          </FilterToggle>
        )}
        {view === "list" && <span className="num ml-auto text-sm text-muted-foreground">{t("orders.count", { count: filtered.length })}</span>}
      </div>

      {view === "board" ? (
        views.length === 0 && !loading ? (
          <EmptyState illustration="orders" title={t("orders.noOrders")} body={t("orders.noOrdersBody")} />
        ) : (
          <OrderBoard views={filtered} now={now} showLocation={multiLocation} showCosts={showCosts} showCancelled={showCancelled} loading={loading} />
        )
      ) : (
        <Card className="py-0">
          <DataTable
            rows={filtered}
            columns={columns}
            rowKey={(v) => v.order.id}
            initialSort={{ id: "date", desc: true }}
            onRowClick={(v) => router.push(`/orders/${v.order.id}`)}
            loading={loading}
            caption={t("orders.title")}
            empty={
              <EmptyState
                illustration="search"
                title={views.length ? t("common.noResults") : t("orders.noOrders")}
                body={views.length ? t("common.noResultsBody") : t("orders.noOrdersBody")}
              />
            }
            mobileCard={(v) => (
              <Link href={`/orders/${v.order.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="num font-semibold text-primary">
                      {t("orders.number")} {v.order.invoiceNumber}
                    </span>
                    <span className="text-xs text-muted-foreground">{f.date(v.order.createdAt, "d MMM")}</span>
                  </div>
                  <p className="truncate text-sm font-medium">{v.client?.fullName}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={v.order.status} />
                    {multiLocation && v.location && <span className="text-xs text-muted-foreground">{shortLocationName(v.location.name)}</span>}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={cn("num text-sm font-semibold")}>{f.money(v.order.total)}</span>
                  {v.order.status !== "cancelled" && <ResteBadge reste={v.reste} compact />}
                </div>
              </Link>
            )}
          />
        </Card>
      )}
    </>
  );
}
