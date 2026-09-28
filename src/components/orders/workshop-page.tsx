"use client";

import { ArrowRight, Clock, Glasses, Timer } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { STATUS_DOT, StatusBadge } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { CardsSkeleton, EmptyState, PageHeader, Stat } from "@/components/shared/page";
import { useActiveLocation, useCan, useLabels, useNow, useRequiredAuth, useSimulatedLoading } from "@/data/hooks";
import { buildOrderViews, indexById, itemsByOrder, type OrderView } from "@/data/indexes";
import { useDb } from "@/data/store";
import { Link } from "@/i18n/navigation";
import { daysInStatus, nextStatus } from "@/lib/calculations";
import { shortLocationName } from "@/lib/format";
import { can as canDo, orderScope, statusPermission } from "@/lib/permissions";
import type { OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { OrderActionsProvider, useOrderActions } from "./order-actions";
import { LATE_AFTER_DAYS } from "./order-card";
import { prescriptionLine } from "./prescription";

const QUEUE: OrderStatus[] = ["confirmed", "workshop", "prepared"];

/** The atelier works for every shop: workshop.view sees the whole queue (narrowed by the topbar selector). */
function useWorkshopViews(): OrderView[] {
  const auth = useRequiredAuth();
  const [active] = useActiveLocation();
  const orders = useDb((db) => db.orders);
  const payments = useDb((db) => db.payments);
  const events = useDb((db) => db.orderStatusEvents);
  const clients = useDb((db) => db.clients);
  const locations = useDb((db) => db.locations);
  return useMemo(() => {
    let scope = orderScope(auth, active);
    if (scope === "none" && canDo(auth, "workshop.view")) scope = active === "all" ? null : [active];
    if (scope === "none") return [];
    return buildOrderViews(orders, payments, events, clients, locations).filter(
      (v) => QUEUE.includes(v.order.status) && (scope === null || scope.includes(v.order.locationId)),
    );
  }, [auth, active, orders, payments, events, clients, locations]);
}

export function WorkshopPage() {
  return (
    <OrderActionsProvider>
      <Workshop />
    </OrderActionsProvider>
  );
}

function ageTone(days: number) {
  if (days > LATE_AFTER_DAYS) return { bar: "bg-destructive", text: "text-destructive" };
  if (days >= 3) return { bar: "bg-attention", text: "text-attention-text" };
  return { bar: "bg-success", text: "text-success-text" };
}

function Workshop() {
  const t = useTranslations();
  const labels = useLabels();
  const can = useCan();
  const actions = useOrderActions();
  const now = useNow();
  const loading = useSimulatedLoading();
  const views = useWorkshopViews();
  const [filter, setFilter] = useState<OrderStatus | "all">("all");
  const [active] = useActiveLocation();
  const allItems = useDb((db) => db.orderItems);
  const products = useDb((db) => db.products);
  const items = itemsByOrder(allItems);
  const productMap = indexById(products);

  const queue = useMemo(
    () =>
      views
        .filter((v) => filter === "all" || v.order.status === filter)
        .sort((a, b) => a.order.createdAt.localeCompare(b.order.createdAt)),
    [views, filter],
  );
  const ages = views.map((v) => daysInStatus(v.order.createdAt, now));
  const avg = ages.length ? ages.reduce((s, d) => s + d, 0) / ages.length : 0;
  const late = views.filter((v) => daysInStatus(v.statusSince, now) > LATE_AFTER_DAYS).length;

  return (
    <>
      <PageHeader title={t("workshop.title")} description={t("workshop.description")} />

      <Card className="mb-5">
        <CardContent className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label={t("workshop.statQueue")} value={t("workshop.queue", { count: views.length })} />
          <Stat label={t("workshop.statAge")} value={t("common.days", { count: Math.round(avg) })} />
          <Stat label={t("workshop.statLate")} value={<span className={late ? "text-destructive" : undefined}>{t("workshop.late", { count: late })}</span>} />
          <div className="col-span-2 space-y-1 sm:col-span-1">
            <p className="text-xs font-medium text-muted-foreground">{t("workshop.statByStep")}</p>
            <div className="flex items-center gap-3 pt-1">
            {QUEUE.map((s) => (
              <span key={s} className="flex items-center gap-1.5 text-sm">
                <span className={cn("size-2.5 rounded-full", STATUS_DOT[s])} aria-hidden="true" />
                <span className="num font-semibold">{views.filter((v) => v.order.status === s).length}</span>
                <span className="sr-only">{t(`status.${s}`)}</span>
              </span>
            ))}
            </div>
          </div>
        </CardContent>
      </Card>

      <ChoiceChips
        label={t("orders.filters.status")}
        className="mb-5"
        value={filter}
        onChange={(v) => setFilter(v as OrderStatus | "all")}
        options={[
          { value: "all", label: `${t("workshop.all")} · ${views.length}` },
          ...QUEUE.map((s) => ({ value: s, label: `${t(`status.${s}`)} · ${views.filter((v) => v.order.status === s).length}` })),
        ]}
      />

      {loading ? (
        <CardsSkeleton count={6} className="xl:grid-cols-3" />
      ) : queue.length === 0 ? (
        <EmptyState illustration="box" title={t("workshop.empty")} body={t("workshop.emptyBody")} />
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {queue.map((v) => {
            const o = v.order;
            const next = nextStatus(o.status)!;
            const age = daysInStatus(o.createdAt, now);
            const inStatus = daysInStatus(v.statusSince, now);
            const tone = ageTone(inStatus);
            const orderItems = items.get(o.id) ?? [];
            const frame = orderItems.find((i) => productMap.get(i.productId)?.kind === "frame");
            const lens = orderItems.find((i) => productMap.get(i.productId)?.kind === "lens");
            return (
              <li key={o.id}>
                <Card className="h-full gap-3 py-4">
                  <CardContent className="flex h-full flex-col gap-3 px-4">
                    <div className="flex items-center gap-2">
                      <Link href={`/orders/${o.id}`} className="num text-lg font-bold text-primary hover:underline">
                        {t("orders.number")} {o.invoiceNumber}
                      </Link>
                      {active === "all" && v.location && (
                        <span className="rounded-md bg-muted px-1.5 py-0.5 text-xs font-medium text-muted-foreground">{shortLocationName(v.location.name)}</span>
                      )}
                      <StatusBadge status={o.status} className="ml-auto" />
                    </div>
                    <p className="truncate font-medium">{v.client?.fullName}</p>
                    <div className="space-y-0.5 rounded-xl bg-muted/60 px-3 py-2 text-sm">
                      <p className="num">
                        <span className="mr-2 font-bold">{t("rx.od")}</span>
                        {prescriptionLine(o.od)}
                      </p>
                      <p className="num">
                        <span className="mr-2 font-bold">{t("rx.og")}</span>
                        {prescriptionLine(o.og)}
                      </p>
                    </div>
                    <dl className="space-y-1 text-sm">
                      <div className="flex gap-2">
                        <dt className="w-16 shrink-0 text-muted-foreground">{t("workshop.lensShort")}</dt>
                        <dd className="min-w-0">
                          <span className="font-medium">{lens ? labels.product(lens.productId) : labels.option(o.lensTypeId)}</span>
                          {o.lensTreatmentIds.length > 0 && (
                            <span className="block truncate text-xs text-muted-foreground">{o.lensTreatmentIds.map((id) => labels.option(id)).join(" · ")}</span>
                          )}
                        </dd>
                      </div>
                      <div className="flex gap-2">
                        <dt className="w-16 shrink-0 text-muted-foreground">{t("workshop.frameShort")}</dt>
                        <dd className="min-w-0 truncate font-medium">{frame ? labels.product(frame.productId) : t("detail.clientFrame")}</dd>
                      </div>
                    </dl>
                    <div className="mt-auto space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className={cn("flex items-center gap-1 font-medium", tone.text)}>
                          <Timer className="size-3.5" aria-hidden="true" />
                          {t("orders.daysInStatus", { count: inStatus })}
                        </span>
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="size-3.5" aria-hidden="true" />
                          {t("workshop.age", { days: t("workshop.ageDays", { count: age }) })}
                        </span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                        <div className={cn("h-full rounded-full transition-all", tone.bar)} style={{ width: `${Math.min(100, ((inStatus + 1) / (LATE_AFTER_DAYS + 2)) * 100)}%` }} />
                      </div>
                    </div>
                    {can(statusPermission(next)) && (
                      <Button size="lg" className="h-12 w-full justify-between text-base" onClick={() => void actions.advance(o.id)}>
                        <span className="flex items-center gap-2">
                          <Glasses className="size-5" aria-hidden="true" />
                          {t(`statusNext.${next}`)}
                        </span>
                        <ArrowRight />
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
