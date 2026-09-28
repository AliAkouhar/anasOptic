"use client";

import { addMonths, format } from "date-fns";
import { Check, ChevronLeft, ChevronRight, Copy, ExternalLink, Info, Loader2, Sparkles } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { MoneyInput } from "@/components/shared/money-input";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared/page";
import { useActiveLocation, useActiveLocations, useCan, useFormat, useLabels, useScopedOrderViews, useSimulatedLoading } from "@/data/hooks";
import { costsByOrder, indexById, itemsByOrder, stockIndex, type OrderView } from "@/data/indexes";
import { chargesRepo, ordersRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { Link } from "@/i18n/navigation";
import { stockKey, sumAmounts } from "@/lib/calculations";
import { formatMonth, shortLocationName } from "@/lib/format";
import { FIXED_CHARGE_TYPES, SUPPLIER_SOURCE, type FixedChargeType, type ID } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ChargesPage() {
  const t = useTranslations("charges");
  const search = useSearchParams();
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs defaultValue={search.get("tab") === "orders" ? "orders" : "fixed"}>
        <TabsList className="mb-5">
          <TabsTrigger value="fixed" className="px-4">
            {t("tabs.fixed")}
          </TabsTrigger>
          <TabsTrigger value="orders" className="px-4">
            {t("tabs.orders")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="fixed">
          <FixedCharges />
        </TabsContent>
        <TabsContent value="orders">
          <OrderCharges />
        </TabsContent>
      </Tabs>
    </>
  );
}

function ChargeCell({
  locationId,
  month,
  type,
  value,
  editable,
  label,
}: {
  locationId: ID;
  month: string;
  type: FixedChargeType;
  value: number | undefined;
  editable: boolean;
  label: string;
}) {
  const t = useTranslations("charges");
  const f = useFormat();
  const labels = useLabels();
  const feedback = useFeedback();
  const [draft, setDraft] = useState<number | undefined>(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  if (!editable) return <span className="num">{value !== undefined ? f.money(value) : "—"}</span>;
  return (
    <MoneyInput
      value={draft}
      onChange={setDraft}
      aria-describedby={undefined}
      className="h-9 min-w-28 pointer-coarse:h-11"
      placeholder="—"
      onBlur={async () => {
        if (draft === value || draft === undefined) return;
        try {
          const { undo } = await chargesRepo.setFixedCharge({ locationId, month, type, amount: draft });
          feedback.success(t("saved", { type: t(`types.${type}`), location: shortLocationName(labels.location(locationId)), amount: f.money(draft) }), { undo });
        } catch (e) {
          feedback.error(e);
          setDraft(value);
        }
      }}
      id={`charge-${locationId}-${type}`}
      aria-label={label}
    />
  );
}

function FixedCharges() {
  const t = useTranslations("charges");
  const tc = useTranslations("common");
  const f = useFormat();
  const can = useCan();
  const feedback = useFeedback();
  const loading = useSimulatedLoading();
  const [active] = useActiveLocation();
  const allLocations = useActiveLocations();
  const charges = useDb((db) => db.fixedCharges);
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
  const [confirmDup, setConfirmDup] = useState(false);
  const editable = can("charges.manage");
  const locations = active === "all" ? allLocations : allLocations.filter((l) => l.id === active);
  const prev = format(addMonths(new Date(`${month}-01T12:00:00`), -1), "yyyy-MM");
  const shift = (n: number) => setMonth((m) => format(addMonths(new Date(`${m}-01T12:00:00`), n), "yyyy-MM"));

  const values = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of charges) if (c.month === month) map.set(`${c.locationId}|${c.type}`, (map.get(`${c.locationId}|${c.type}`) ?? 0) + c.amount);
    return map;
  }, [charges, month]);
  const colTotal = (loc: ID) => FIXED_CHARGE_TYPES.reduce((s, ty) => s + (values.get(`${loc}|${ty}`) ?? 0), 0);
  const rowTotal = (ty: FixedChargeType) => locations.reduce((s, l) => s + (values.get(`${l.id}|${ty}`) ?? 0), 0);
  const grand = locations.reduce((s, l) => s + colTotal(l.id), 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1 rounded-xl border bg-card p-1">
          <Button variant="ghost" size="icon-sm" onClick={() => shift(-1)} aria-label={t("prevMonth")}>
            <ChevronLeft />
          </Button>
          <span className="min-w-36 text-center font-semibold capitalize" aria-live="polite">
            {formatMonth(month, f.lang, "MMMM yyyy")}
          </span>
          <Button variant="ghost" size="icon-sm" onClick={() => shift(1)} aria-label={t("nextMonth")}>
            <ChevronRight />
          </Button>
        </div>
        {editable && (
          <Button variant="outline" onClick={() => setConfirmDup(true)}>
            <Copy />
            {t("duplicate")}
          </Button>
        )}
        <span className="ml-auto text-sm text-muted-foreground">
          {t("monthTotal")}{tc("colon")} <span className="num font-semibold text-foreground">{f.money(grand)}</span>
        </span>
      </div>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Info className="size-3.5" aria-hidden="true" />
        {editable ? t("fixedNote") : t("readOnly")}
      </p>

      {loading ? (
        <ListSkeleton />
      ) : (
        <>
          {/* Desktop grid: rows = types, columns = locations. */}
          <Card className="hidden py-0 md:block">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <caption className="sr-only">{t("tabs.fixed")}</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    <th scope="col" className="h-11 px-5 font-medium">
                      {t("type")}
                    </th>
                    {locations.map((l) => (
                      <th key={l.id} scope="col" className="px-2 font-medium">
                        {shortLocationName(l.name)}
                      </th>
                    ))}
                    <th scope="col" className="px-5 text-right font-medium">
                      {t("totalRow")}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {FIXED_CHARGE_TYPES.map((ty) => (
                    <tr key={ty} className="border-b">
                      <th scope="row" className="px-5 py-2 text-left font-medium">
                        {t(`types.${ty}`)}
                      </th>
                      {locations.map((l) => (
                        <td key={l.id} className="px-2 py-2">
                          <ChargeCell
                            locationId={l.id}
                            month={month}
                            type={ty}
                            value={values.get(`${l.id}|${ty}`)}
                            editable={editable}
                            label={t("cellLabel", { type: t(`types.${ty}`), location: l.name })}
                          />
                        </td>
                      ))}
                      <td className="num px-5 py-2 text-right font-medium">{f.money(rowTotal(ty))}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-muted/50 font-semibold">
                    <th scope="row" className="px-5 py-3 text-left">
                      {t("totalRow")}
                    </th>
                    {locations.map((l) => (
                      <td key={l.id} className="num px-4 py-3">
                        {f.money(colTotal(l.id))}
                      </td>
                    ))}
                    <td className="num px-5 py-3 text-right">{f.money(grand)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>
          {/* Phones: one card per location. */}
          <div className="space-y-4 md:hidden">
            {locations.map((l) => (
              <Card key={l.id} className="gap-3">
                <CardContent className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="font-semibold">{l.name}</p>
                    <p className="num font-semibold">{f.money(colTotal(l.id))}</p>
                  </div>
                  {FIXED_CHARGE_TYPES.map((ty) => (
                    <div key={ty} className="flex items-center justify-between gap-3">
                      <span className="text-sm text-muted-foreground">{t(`types.${ty}`)}</span>
                      <div className="w-36">
                        <ChargeCell
                          locationId={l.id}
                          month={month}
                          type={ty}
                          value={values.get(`${l.id}|${ty}`)}
                          editable={editable}
                          label={t("cellLabel", { type: t(`types.${ty}`), location: l.name })}
                        />
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </>
      )}
      <ConfirmDialog
        open={confirmDup}
        onOpenChange={setConfirmDup}
        destructive={false}
        title={t("duplicateTitle", { month: formatMonth(prev, f.lang, "MMMM yyyy"), target: formatMonth(month, f.lang, "MMMM yyyy") })}
        description={t("duplicateBody", { month: formatMonth(prev, f.lang, "MMMM yyyy"), target: formatMonth(month, f.lang, "MMMM yyyy") })}
        confirmLabel={t("duplicate")}
        onConfirm={async () => {
          try {
            const { copied, undo } = await chargesRepo.duplicatePreviousMonth(
              month,
              locations.map((l) => l.id),
            );
            feedback.success(t("duplicated", { count: copied }), { undo });
          } catch (e) {
            feedback.error(e);
          }
        }}
      />
    </div>
  );
}

function QuickCostRow({ view }: { view: OrderView }) {
  const t = useTranslations();
  const f = useFormat();
  const feedback = useFeedback();
  const allItems = useDb((db) => db.orderItems);
  const products = useDb((db) => db.products);
  const movements = useDb((db) => db.stockMovements);
  const locations = useActiveLocations();
  const productMap = indexById(products);
  const items = itemsByOrder(allItems).get(view.order.id) ?? [];
  const lenses = items.filter((i) => productMap.get(i.productId)?.kind === "lens" && !i.sourceLocationId);
  const lab = locations.find((l) => l.type === "lab");
  const levels = stockIndex(movements);
  const estimate =
    items.reduce((s, i) => s + (productMap.get(i.productId)?.purchasePrice ?? 0) * i.qty, 0) + 80;
  const defaultSource = lenses.every((l) => lab && (levels.get(stockKey(l.productId, lab.id)) ?? 0) >= l.qty) ? lab?.id : SUPPLIER_SOURCE;
  const [amount, setAmount] = useState<number | undefined>(undefined);
  const [source, setSource] = useState<ID | undefined>(defaultSource);
  const [pending, setPending] = useState(false);

  const save = async () => {
    const value = amount ?? estimate;
    setPending(true);
    try {
      const { undo } = await ordersRepo.saveCosts(view.order.id, {
        lines: [{ label: t("charges.quickLabel"), amount: value }],
        lensSources: Object.fromEntries(lenses.map((l) => [l.id, source ?? SUPPLIER_SOURCE])),
      });
      feedback.success(t("charges.savedOrder", { number: view.order.invoiceNumber }), { undo });
    } catch (e) {
      feedback.error(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <li className="grid gap-3 px-4 py-3 sm:px-5 lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_auto] lg:items-center">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <Link href={`/orders/${view.order.id}#charges`} className="num font-semibold text-primary hover:underline">
            {t("orders.number")} {view.order.invoiceNumber}
          </Link>
          <span className="text-xs text-muted-foreground">
            {shortLocationName(view.location?.name ?? "")} · {f.date(view.order.createdAt, "d MMM")}
          </span>
        </div>
        <p className="truncate text-sm">
          {view.client?.fullName} · <span className="num font-medium">{f.money(view.order.total)}</span>
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <MoneyInput value={amount} onChange={setAmount} placeholder={f.number(estimate)} className="w-32" aria-describedby={undefined} />
        <Button type="button" variant="ghost" size="sm" onClick={() => setAmount(estimate)} title={t("charges.useEstimate")}>
          <Sparkles />
          <span className="num">{t("charges.estimate", { amount: f.money(estimate) })}</span>
        </Button>
        {lenses.length > 0 && (
          <Select value={source} onValueChange={setSource}>
            <SelectTrigger className="w-full sm:w-48" aria-label={t("charges.lensSource")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id} disabled={lenses.some((ln) => (levels.get(stockKey(ln.productId, l.id)) ?? 0) < ln.qty)}>
                  {l.name}
                </SelectItem>
              ))}
              <SelectItem value={SUPPLIER_SOURCE}>{t("costs.supplier")}</SelectItem>
            </SelectContent>
          </Select>
        )}
      </div>
      <div className="flex items-center gap-2 lg:justify-end">
        <Button onClick={save} disabled={pending} size="sm">
          {pending ? <Loader2 className="animate-spin" /> : <Check />}
          {t("charges.save")}
        </Button>
        <Button asChild variant="ghost" size="icon-sm" aria-label={t("charges.openOrder")}>
          <Link href={`/orders/${view.order.id}#charges`}>
            <ExternalLink />
          </Link>
        </Button>
      </div>
    </li>
  );
}

function OrderCharges() {
  const t = useTranslations();
  const f = useFormat();
  const can = useCan();
  const loading = useSimulatedLoading();
  const views = useScopedOrderViews();
  const costs = useDb((db) => db.orderCosts);
  const [filter, setFilter] = useState<"missing" | "done">("missing");
  const [limit, setLimit] = useState(20);
  const missing = useMemo(
    () => views.filter((v) => !v.order.costsCompleted && v.order.status !== "cancelled").sort((a, b) => a.order.createdAt.localeCompare(b.order.createdAt)),
    [views],
  );
  const done = useMemo(
    () => views.filter((v) => v.order.costsCompleted && v.order.status !== "cancelled").sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt)),
    [views],
  );
  const list = filter === "missing" ? missing : done;
  const costMap = costsByOrder(costs);
  const editable = can("orders.edit_costs");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ChoiceChips
          label={t("charges.tabs.orders")}
          value={filter}
          onChange={(v) => {
            setFilter(v as "missing" | "done");
            setLimit(20);
          }}
          options={[
            { value: "missing", label: `${t("charges.toComplete")} · ${missing.length}` },
            { value: "done", label: `${t("charges.completed")} · ${done.length}` },
          ]}
        />
        <p className="flex items-center gap-2 text-xs text-muted-foreground">
          <Info className="size-3.5" aria-hidden="true" />
          {t("charges.ordersNote")}
        </p>
      </div>
      <Card className="py-0">
        {loading ? (
          <ListSkeleton className="p-5" />
        ) : list.length === 0 ? (
          <EmptyState illustration="chart" title={t("charges.noneMissing")} body={t("charges.noneMissingBody")} />
        ) : (
          <>
            <ul className="divide-y">
              {list.slice(0, limit).map((v) =>
                filter === "missing" && editable ? (
                  <QuickCostRow key={v.order.id} view={v} />
                ) : (
                  <li key={v.order.id} className="flex flex-wrap items-center gap-3 px-4 py-3 sm:px-5">
                    <Link href={`/orders/${v.order.id}#charges`} className="num font-semibold text-primary hover:underline">
                      {t("orders.number")} {v.order.invoiceNumber}
                    </Link>
                    <span className="min-w-0 flex-1 truncate text-sm">
                      {v.client?.fullName} · <span className="text-muted-foreground">{shortLocationName(v.location?.name ?? "")}</span>
                    </span>
                    {(() => {
                      const c = sumAmounts(costMap.get(v.order.id) ?? []);
                      const m = v.order.total - c;
                      return (
                        <span className="num flex gap-4 text-sm">
                          <span className="text-muted-foreground">
                            {t("charges.costTotal")} {f.money(c)}
                          </span>
                          <span className={cn("font-semibold", m >= 0 ? "text-success-text" : "text-destructive")}>
                            {t("charges.margin")} {f.money(m)}
                          </span>
                        </span>
                      );
                    })()}
                  </li>
                ),
              )}
            </ul>
            {list.length > limit && (
              <div className="border-t p-3">
                <Button variant="ghost" className="w-full" onClick={() => setLimit((l) => l + 20)}>
                  {t("notifications.showMore", { count: list.length - limit })}
                </Button>
              </div>
            )}
          </>
        )}
      </Card>
    </div>
  );
}
