"use client";

import { ArrowRight, Banknote, Ban, ExternalLink, History, MoreHorizontal, Package, Phone, Plus, ReceiptText } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SegmentBadge, StatusBadge, WhatsAppIcon } from "@/components/shared/badges";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { useCan, useFormat, useLabels, useRequiredAuth } from "@/data/hooks";
import { clientStats, customFieldOptions, eventsByOrder, indexById, itemsByOrder, paymentsByOrder } from "@/data/indexes";
import { useDb, useDbStore } from "@/data/store";
import { Link } from "@/i18n/navigation";
import { nextStatus, orderReste, sumAmounts } from "@/lib/calculations";
import { formatPhone } from "@/lib/format";
import { canViewOrder, statusPermission } from "@/lib/permissions";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { CostsCard } from "./costs-card";
import { OrderActionsProvider, useOrderActions } from "./order-actions";
import { PrescriptionTable } from "./prescription";
import { StatusTimeline } from "./status-timeline";

export function OrderDetailPage({ id }: { id: string }) {
  return (
    <OrderActionsProvider>
      <OrderDetail id={id} />
    </OrderActionsProvider>
  );
}

function OrderDetail({ id }: { id: string }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const can = useCan();
  const auth = useRequiredAuth();
  const actions = useOrderActions();
  const order = useDb((db) => db.orders.find((o) => o.id === id));
  const allPayments = useDb((db) => db.payments);
  const allEvents = useDb((db) => db.orderStatusEvents);
  const clients = useDb((db) => db.clients);
  const payments = useMemo(() => [...(paymentsByOrder(allPayments).get(id) ?? [])].sort((a, b) => a.createdAt.localeCompare(b.createdAt)), [allPayments, id]);
  const events = useMemo(() => eventsByOrder(allEvents).get(id) ?? [], [allEvents, id]);

  useEffect(() => {
    if (window.location.hash === "#charges") {
      setTimeout(() => document.getElementById("charges")?.scrollIntoView({ behavior: "smooth", block: "start" }), 400);
    }
  }, []);

  if (!order || !canViewOrder(auth, order)) {
    return (
      <EmptyState
        illustration="search"
        title={t("common.noResults")}
        body={t("detail.notFound")}
        action={
          <Button asChild variant="outline">
            <Link href={can("orders.view_all") || can("orders.view_own_location") ? "/orders" : "/"}>{t("detail.backToOrders")}</Link>
          </Button>
        }
      />
    );
  }

  const client = indexById(clients).get(order.clientId);
  const reste = orderReste(order, payments);
  const paid = sumAmounts(payments);
  const next = nextStatus(order.status);
  const canNext = !!next && can(statusPermission(next));
  const whatsapp = order.status === "in_store" ? actions.whatsappHref(order.id) : null;
  const active = order.status !== "cancelled" && order.status !== "delivered";
  const canCollect = order.status !== "cancelled" && reste > 0 && (can("orders.create") || can("orders.set_status.delivered"));

  return (
    <>
      <PageHeader
        backHref={can("orders.view_all") || can("orders.view_own_location") ? "/orders" : "/workshop"}
        title={t("detail.title", { number: order.invoiceNumber })}
        description={
          <>
            {labels.location(order.locationId)} · {t("detail.createdBy", { date: f.dateTime(order.createdAt), user: labels.user(order.createdBy) })}
          </>
        }
        actions={
          <>
            {whatsapp && (
              <Button asChild variant="whatsapp">
                <a href={whatsapp} target="_blank" rel="noopener noreferrer">
                  <WhatsAppIcon />
                  {t("orders.whatsappNotify")}
                </a>
              </Button>
            )}
            {canCollect && (
              <Button variant={order.status === "in_store" ? "attention" : "outline"} onClick={() => actions.collect(order.id, { deliver: order.status === "in_store" })}>
                <Banknote />
                {t("detail.collect")}
              </Button>
            )}
            {canNext && next && (
              <Button onClick={() => void actions.advance(order.id)}>
                {t(`statusNext.${next}`)}
                <ArrowRight />
              </Button>
            )}
            {active && (can("orders.cancel") || canCollect) && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="icon" aria-label={t("detail.actions")}>
                    <MoreHorizontal />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  {canCollect && (
                    <DropdownMenuItem onSelect={() => actions.collect(order.id)}>
                      <Plus />
                      {t("detail.addPayment")}
                    </DropdownMenuItem>
                  )}
                  {can("orders.cancel") && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => actions.cancel(order.id)}>
                        <Ban />
                        {t("detail.cancelOrder")}
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </>
        }
      >
        <div className="pt-2">
          <StatusBadge status={order.status} />
        </div>
      </PageHeader>

      <Card className="mb-6">
        <CardContent>
          <StatusTimeline status={order.status} events={events} />
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:grid-rows-[auto_1fr] xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="min-w-0 space-y-6 lg:row-span-2">
          <Card>
            <CardHeader>
              <CardTitle>{t("detail.prescription")}</CardTitle>
            </CardHeader>
            <CardContent>
              <PrescriptionTable od={order.od} og={order.og} />
            </CardContent>
          </Card>
          <ProductsCard order={order} />
          <Card>
            <CardHeader>
              <CardTitle>{t("detail.payments")}</CardTitle>
              {canCollect && (
                <CardAction>
                  <Button variant="outline" size="sm" onClick={() => actions.collect(order.id)}>
                    <Plus />
                    {t("detail.addPayment")}
                  </Button>
                </CardAction>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {payments.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("detail.noPayments")}</p>
              ) : (
                <ul className="divide-y rounded-xl border">
                  {payments.map((p) => (
                    <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-muted text-muted-foreground">
                        <ReceiptText className="size-4" aria-hidden="true" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">
                          {t(`detail.paymentKinds.${p.kind}`)} · {labels.option(p.methodId)}
                        </p>
                        <p className="num text-xs text-muted-foreground">
                          {f.dateTime(p.createdAt)} · {labels.user(p.userId)}
                        </p>
                      </div>
                      <span className={cn("num font-semibold", p.amount < 0 && "text-destructive")}>{f.money(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              )}
              <dl className="grid grid-cols-3 gap-3 rounded-xl bg-muted/50 p-4">
                <div>
                  <dt className="text-xs text-muted-foreground">{t("money.total")}</dt>
                  <dd className="num mt-1 font-semibold">{f.money(order.total)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("money.paidAmount")}</dt>
                  <dd className="num mt-1 font-semibold">{f.money(paid)}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">{t("money.reste")}</dt>
                  <dd className={cn("num mt-1 text-lg font-bold", order.status === "cancelled" ? "text-muted-foreground" : reste > 0 ? "text-attention-text" : "text-success-text")}>
                    {f.money(reste)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
          <CustomValuesCard order={order} />
          <HistoryCard order={order} />
        </div>

        {/* Phones: the client comes first; desktop: right column. */}
        <div className="order-first lg:order-none">
          {client && (
            <Card>
              <CardHeader>
                <CardTitle>{t("detail.client")}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ClientSummary clientId={client.id} />
                <div className="flex flex-wrap gap-2">
                  <Button asChild variant="outline" size="sm">
                    <a href={`tel:${client.phone}`}>
                      <Phone />
                      <span className="num">{formatPhone(client.phone)}</span>
                    </a>
                  </Button>
                  {can("clients.manage") && (
                    <Button asChild variant="ghost" size="sm">
                      <Link href={`/clients/${client.id}`}>
                        <ExternalLink />
                        {t("detail.openClient")}
                      </Link>
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
        {/* Admin only: not rendered at all (and its data never read) for other roles. */}
        {can("orders.view_costs") && (
          <div className="self-start">
            <CostsCard key={`${order.id}-${order.costsCompleted}`} order={order} />
          </div>
        )}
      </div>
    </>
  );
}

function ClientSummary({ clientId }: { clientId: string }) {
  const t = useTranslations();
  const db = useDbStore((s) => s.db)!;
  const client = db.clients.find((c) => c.id === clientId)!;
  const stats = clientStats(db, null).get(clientId);
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-lg font-semibold">{client.fullName}</p>
        {stats && <SegmentBadge segment={stats.segment} />}
      </div>
      <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
        {client.isWhatsapp ? (
          <>
            <WhatsAppIcon className="text-whatsapp" /> {t("common.whatsapp")}
          </>
        ) : (
          <>
            <Phone className="size-4" /> {t("common.phone")}
          </>
        )}
        {stats && <> · {t("wizard.ordersCount", { count: stats.globalOrderCount })}</>}
      </p>
    </div>
  );
}

function ProductsCard({ order }: { order: Order }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const allItems = useDb((db) => db.orderItems);
  const products = useDb((db) => db.products);
  const items = itemsByOrder(allItems).get(order.id) ?? [];
  const productMap = indexById(products);
  const frame = items.find((i) => productMap.get(i.productId)?.kind === "frame");
  const lenses = items.filter((i) => productMap.get(i.productId)?.kind === "lens");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("detail.products")}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            <Package className="size-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">{t("detail.frame")}</p>
            {frame ? (
              <p className="font-medium">
                {labels.product(frame.productId)}
                {productMap.get(frame.productId)?.salePrice ? (
                  <span className="num ml-2 text-sm font-normal text-muted-foreground">{f.money(productMap.get(frame.productId)!.salePrice!)}</span>
                ) : null}
              </p>
            ) : (
              <p className="font-medium">{t("detail.clientFrame")}</p>
            )}
            {order.frameDescription && <p className="text-sm text-muted-foreground">{order.frameDescription}</p>}
          </div>
        </div>
        <div className="flex gap-3 border-t pt-4">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
            <svg viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
              <circle cx="7" cy="13" r="4" />
              <circle cx="17" cy="13" r="4" />
              <path d="M11 12.5c.7-.6 1.3-.6 2 0" />
            </svg>
          </span>
          <div className="min-w-0 flex-1 space-y-1">
            <p className="text-xs font-medium text-muted-foreground uppercase">{t("detail.lens")}</p>
            {lenses.length > 0 ? (
              lenses.map((l) => (
                <p key={l.id} className="font-medium">
                  {labels.product(l.productId)} <span className="num text-sm font-normal text-muted-foreground">{t("detail.qty", { qty: l.qty })}</span>
                </p>
              ))
            ) : (
              <p className="font-medium">{order.lensTypeId ? labels.option(order.lensTypeId) : t("detail.noProducts")}</p>
            )}
            {order.lensTypeId && lenses.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("detail.lensType")}{t("common.colon")} {labels.option(order.lensTypeId)}
              </p>
            )}
            {order.lensTreatmentIds.length > 0 && (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {order.lensTreatmentIds.map((id) => (
                  <span key={id} className="rounded-full bg-muted px-2.5 py-0.5 text-xs font-medium">
                    {labels.option(id)}
                  </span>
                ))}
              </div>
            )}
            {order.lensDescription && <p className="text-sm text-muted-foreground">{order.lensDescription}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function CustomValuesCard({ order }: { order: Order }) {
  const t = useTranslations();
  const labels = useLabels();
  const fields = useDb((db) => db.customFields);
  const entries = fields
    .filter((field) => order.customValues[field.id] !== undefined && order.customValues[field.id] !== "")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (entries.length === 0) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("detail.customFields")}</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-3 sm:grid-cols-2">
          {entries.map((field) => {
            const raw = order.customValues[field.id];
            let value = String(raw);
            if (field.type === "select") {
              const i = field.optionsFr?.indexOf(value) ?? -1;
              if (i >= 0) value = customFieldOptions(field, labels.lang)[i] ?? value;
            }
            if (field.type === "date" && typeof raw === "string") value = new Date(raw).toLocaleDateString(labels.lang === "fr" ? "fr-FR" : "en-GB");
            return (
              <div key={field.id} className="rounded-xl bg-muted/50 p-3">
                <dt className="text-xs text-muted-foreground">{labels.localized(field)}</dt>
                <dd className="num mt-0.5 font-semibold">{value}</dd>
              </div>
            );
          })}
        </dl>
      </CardContent>
    </Card>
  );
}

function HistoryCard({ order }: { order: Order }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const allEvents = useDb((db) => db.orderStatusEvents);
  const allPayments = useDb((db) => db.payments);
  const movements = useDb((db) => db.stockMovements);
  const entries = useMemo(() => {
    const list: { at: string; text: string; user: string }[] = [];
    for (const e of eventsByOrder(allEvents).get(order.id) ?? []) {
      list.push({
        at: e.createdAt,
        text: e.from === undefined ? t("detail.historyCreated") : t("detail.historyStatus", { status: t(`status.${e.to}`) }),
        user: labels.user(e.userId),
      });
    }
    for (const p of paymentsByOrder(allPayments).get(order.id) ?? []) {
      list.push({
        at: p.createdAt,
        text: t("detail.historyPayment", { kind: t(`detail.paymentKinds.${p.kind}`), amount: f.money(Math.abs(p.amount)), method: labels.option(p.methodId) }),
        user: labels.user(p.userId),
      });
    }
    for (const m of movements) {
      if (m.refId !== order.id) continue;
      list.push({
        at: m.createdAt,
        text: t("detail.historyStock", { location: labels.location(m.locationId), qty: m.qty > 0 ? `+${m.qty}` : `−${Math.abs(m.qty)}`, product: labels.product(m.productId) }),
        user: labels.user(m.userId),
      });
    }
    return list.sort((a, b) => b.at.localeCompare(a.at));
  }, [allEvents, allPayments, movements, order.id, t, f, labels]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <History className="size-4 text-muted-foreground" aria-hidden="true" />
          {t("detail.history")}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ol className="relative space-y-4 border-l pl-5">
          {entries.map((e, i) => (
            <li key={i} className="relative">
              <span className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-primary" aria-hidden="true" />
              <p className="text-sm">{e.text}</p>
              <p className="num text-xs text-muted-foreground">
                {f.dateTime(e.at)} · {e.user}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}
