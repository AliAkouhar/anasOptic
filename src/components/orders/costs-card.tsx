"use client";

import { Loader2, Lock, Plus, Sparkles, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFeedback } from "@/components/shared/feedback";
import { MoneyInput } from "@/components/shared/money-input";
import { useActiveLocations, useCan, useFormat, useLabels } from "@/data/hooks";
import { costsByOrder, indexById, itemsByOrder, stockIndex } from "@/data/indexes";
import { ordersRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { round2, stockKey } from "@/lib/calculations";
import { SUPPLIER_SOURCE, type ID, type Order } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Line {
  key: string;
  id?: ID;
  label: string;
  amount: number | undefined;
}

let lineSeq = 0;
const newLine = (label = "", amount?: number, id?: ID): Line => ({ key: `l${lineSeq++}`, id, label, amount });

/**
 * Admin only: variable costs of the order, where each lens comes from, and the resulting margin.
 * This component is never rendered for users without `orders.view_costs`.
 */
export function CostsCard({ order }: { order: Order }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const can = useCan();
  const feedback = useFeedback();
  const editable = can("orders.edit_costs") && order.status !== "cancelled";
  const allCosts = useDb((db) => db.orderCosts);
  const allItems = useDb((db) => db.orderItems);
  const products = useDb((db) => db.products);
  const movements = useDb((db) => db.stockMovements);
  const locations = useActiveLocations();
  const productMap = indexById(products);
  const levels = stockIndex(movements);
  const savedCosts = useMemo(() => costsByOrder(allCosts).get(order.id) ?? [], [allCosts, order.id]);
  const items = useMemo(() => itemsByOrder(allItems).get(order.id) ?? [], [allItems, order.id]);
  const lensItems = items.filter((i) => productMap.get(i.productId)?.kind === "lens");
  const frameItem = items.find((i) => productMap.get(i.productId)?.kind === "frame");

  const [lines, setLines] = useState<Line[]>(() => (savedCosts.length ? savedCosts.map((c) => newLine(c.label, c.amount, c.id)) : [newLine()]));
  const [sources, setSources] = useState<Record<ID, ID>>(() =>
    Object.fromEntries(lensItems.filter((i) => i.sourceLocationId).map((i) => [i.id, i.sourceLocationId!])),
  );
  const [addLens, setAddLens] = useState<{ productId?: ID; source?: ID }>({});
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);

  const totalCosts = round2(lines.reduce((s, l) => s + (l.amount ?? 0), 0));
  const margin = round2(order.total - totalCosts);
  const rate = order.total ? margin / order.total : 0;
  const missingSource = lensItems.some((i) => !sources[i.id]) || (addLens.productId && !addLens.source);
  const dirty =
    !order.costsCompleted ||
    lines.length !== savedCosts.length ||
    lines.some((l, i) => l.label !== savedCosts[i]?.label || l.amount !== savedCosts[i]?.amount) ||
    lensItems.some((i) => sources[i.id] !== i.sourceLocationId) ||
    !!addLens.productId;

  const prefill = () => {
    const next: Line[] = [];
    const frame = frameItem ? productMap.get(frameItem.productId) : undefined;
    if (frame) next.push(newLine(t("costs.prefillFrame"), frame.purchasePrice));
    for (const li of lensItems) {
      const p = productMap.get(li.productId);
      if (p) next.push(newLine(t("costs.prefillLens", { name: p.name }), p.purchasePrice * li.qty));
    }
    next.push(newLine(t("costs.prefillLabour"), 80));
    setLines(next);
  };

  const save = async () => {
    setTouched(true);
    if (missingSource) return;
    setPending(true);
    try {
      const { undo } = await ordersRepo.saveCosts(order.id, {
        lines: lines.map((l) => ({ id: l.id, label: l.label, amount: l.amount ?? 0 })),
        lensSources: sources,
        addLens: addLens.productId && addLens.source ? { productId: addLens.productId, qty: 2, source: addLens.source } : undefined,
      });
      setAddLens({});
      feedback.success(t("costs.saved", { margin: f.money(margin) }), { undo });
    } catch (e) {
      feedback.error(e);
    } finally {
      setPending(false);
    }
  };

  const sourceSelect = (productId: ID, value: ID | undefined, onChange: (v: ID) => void, id: string, qty: number) => (
    <Select value={value ?? ""} onValueChange={onChange} disabled={!editable}>
      <SelectTrigger id={id} className="w-full" aria-invalid={touched && !value}>
        <SelectValue placeholder={t("costs.chooseSource")} />
      </SelectTrigger>
      <SelectContent>
        <SelectGroup>
          {[...locations].sort((a, b) => Number(b.type === "lab") - Number(a.type === "lab")).map((l) => {
            const stock = levels.get(stockKey(productId, l.id)) ?? 0;
            return (
              <SelectItem key={l.id} value={l.id} disabled={stock < qty && value !== l.id}>
                <span className="flex-1">{l.name}</span>
                <span className={cn("num text-xs", stock < qty ? "text-destructive" : "text-muted-foreground")}>{t("costs.stockAt", { count: stock })}</span>
              </SelectItem>
            );
          })}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>—</SelectLabel>
          <SelectItem value={SUPPLIER_SOURCE}>{t("costs.supplier")}</SelectItem>
        </SelectGroup>
      </SelectContent>
    </Select>
  );

  return (
    <Card id="charges" className="scroll-mt-24 ring-2 ring-primary/10">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t("costs.title")}</CardTitle>
          {order.status !== "cancelled" && (
            <span
              className={cn(
                "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                order.costsCompleted ? "bg-success/10 text-success-text" : "bg-attention/10 text-attention-text",
              )}
            >
              {order.costsCompleted ? t("costs.completed") : t("costs.needed")}
            </span>
          )}
        </div>
        <CardDescription className="flex items-center gap-1.5 text-xs">
          <Lock className="size-3" aria-hidden="true" />
          {t("costs.adminOnly")}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {order.status === "cancelled" ? (
          <p className="text-sm text-muted-foreground">{t("costs.cancelledNote")}</p>
        ) : (
          <>
            <div className="space-y-2">
              <h3 className="text-sm font-semibold">{t("costs.lines")}</h3>
              <ul className="space-y-2">
                {lines.map((line, i) => (
                  <li key={line.key} className="flex flex-wrap items-center gap-2">
                    <Input
                      value={line.label}
                      onChange={(e) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, label: e.target.value } : l)))}
                      placeholder={t("costs.labelPlaceholder")}
                      aria-label={`${t("costs.label")} ${i + 1}`}
                      disabled={!editable}
                      className="min-w-40 flex-[1_1_11rem]"
                    />
                    <MoneyInput
                      value={line.amount}
                      onChange={(v) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, amount: v } : l)))}
                      className="w-28 flex-1 sm:flex-none"
                      disabled={!editable}
                    />
                    {editable && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        aria-label={t("costs.removeLine")}
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== line.key) : [newLine()]))}
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
              {editable && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, newLine()])}>
                    <Plus />
                    {t("costs.addLine")}
                  </Button>
                  <Button type="button" variant="ghost" size="sm" onClick={prefill}>
                    <Sparkles />
                    {t("costs.prefill")}
                  </Button>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t pt-4">
              <div>
                <h3 className="text-sm font-semibold">{t("costs.lensSources")}</h3>
                <p className="text-xs text-muted-foreground">{t("costs.lensSourceHint")}</p>
              </div>
              {lensItems.map((item) => (
                <div key={item.id} className="space-y-1.5">
                  <Label htmlFor={`src-${item.id}`} className="text-sm font-normal">
                    {labels.product(item.productId)} <span className="num text-muted-foreground">× {item.qty}</span>
                  </Label>
                  {sourceSelect(item.productId, sources[item.id], (v) => setSources((s) => ({ ...s, [item.id]: v })), `src-${item.id}`, item.qty)}
                </div>
              ))}
              {lensItems.length === 0 && editable && (
                <div className="space-y-2 rounded-xl bg-muted/50 p-3">
                  <p className="text-xs text-muted-foreground">{t("costs.addLensHint")}</p>
                  <Select value={addLens.productId ?? ""} onValueChange={(v) => setAddLens((a) => ({ ...a, productId: v }))}>
                    <SelectTrigger className="w-full" aria-label={t("costs.addLens")}>
                      <SelectValue placeholder={t("costs.addLens")} />
                    </SelectTrigger>
                    <SelectContent>
                      {products
                        .filter((p) => p.kind === "lens" && p.isActive && (!order.lensTypeId || p.lensTypeId === order.lensTypeId))
                        .map((p) => (
                          <SelectItem key={p.id} value={p.id}>
                            {labels.product(p.id)}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  {addLens.productId && sourceSelect(addLens.productId, addLens.source, (v) => setAddLens((a) => ({ ...a, source: v })), "src-new", 2)}
                </div>
              )}
              {touched && missingSource && <p className="text-sm text-destructive">{t("errors.lens_source_missing")}</p>}
            </div>

            <dl className="space-y-1.5 rounded-xl bg-muted/50 p-4 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("costs.revenue")}</dt>
                <dd className="num">{f.money(order.total)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">{t("costs.totalCosts")}</dt>
                <dd className="num">{f.money(-totalCosts)}</dd>
              </div>
              <div className="flex items-baseline justify-between border-t pt-2">
                <dt className="font-semibold">{t("costs.margin")}</dt>
                <dd className="text-right">
                  <span className={cn("num block text-xl font-bold", margin >= 0 ? "text-success-text" : "text-destructive")}>{f.money(margin)}</span>
                  <span className="num text-xs text-muted-foreground">{t("costs.marginRate", { rate: f.percent(rate) })}</span>
                </dd>
              </div>
            </dl>

            {editable && (
              <Button type="button" className="w-full" size="lg" onClick={save} disabled={pending || !dirty}>
                {pending && <Loader2 className="animate-spin" />}
                {t("costs.save")}
              </Button>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
