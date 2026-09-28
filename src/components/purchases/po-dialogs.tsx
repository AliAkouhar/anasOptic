"use client";

import { CheckCircle2, Loader2, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { MoneyInput } from "@/components/shared/money-input";
import { ProductCombobox } from "@/components/shared/product-combobox";
import { useActiveLocations, useFormat, useLabels } from "@/data/hooks";
import { purchasesRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import type { ID, PurchaseOrder } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Line {
  key: number;
  productId?: ID;
  qty: number;
  unitCost: number | undefined;
}
let seq = 0;

/** Mount it with a `key` per purchase order so the form starts fresh each time. */
export function PoFormDialog({ open, onOpenChange, po }: { open: boolean; onOpenChange: (o: boolean) => void; po?: PurchaseOrder }) {
  const t = useTranslations("purchases");
  const tc = useTranslations("common");
  const f = useFormat();
  const feedback = useFeedback();
  const suppliers = useDb((db) => db.suppliers);
  const products = useDb((db) => db.products);
  const locations = useActiveLocations();
  const [supplierId, setSupplierId] = useState<ID | undefined>(po?.supplierId);
  const [locationId, setLocationId] = useState<ID>(po?.locationId ?? locations.find((l) => l.type === "lab")?.id ?? locations[0]?.id ?? "");
  const [lines, setLines] = useState<Line[]>(() => (po ? po.items.map((it) => ({ key: seq++, ...it })) : [{ key: seq++, qty: 5, unitCost: undefined }]));
  const [pending, setPending] = useState<"draft" | "ordered" | null>(null);
  const [touched, setTouched] = useState(false);

  const total = lines.reduce((s, l) => s + (l.unitCost ?? 0) * l.qty, 0);
  const errors = {
    supplier: supplierId ? null : t("form.chooseSupplier"),
    items: lines.some((l) => !l.productId || !(l.qty > 0)) ? t("form.chooseProduct") : null,
  };
  const chosen = new Set(lines.map((l) => l.productId).filter(Boolean) as ID[]);

  const save = async (status: "draft" | "ordered") => {
    setTouched(true);
    if (errors.supplier || errors.items || !supplierId) return;
    setPending(status);
    const items = lines.map((l) => ({ productId: l.productId!, qty: l.qty, unitCost: l.unitCost ?? 0 }));
    try {
      if (po) {
        await purchasesRepo.update(po.id, { supplierId, locationId, items });
        if (status === "ordered") await purchasesRepo.markOrdered(po.id);
        feedback.success(t("form.saved", { reference: po.reference }));
      } else {
        const { po: created } = await purchasesRepo.create({ supplierId, locationId, items, status });
        feedback.success(t("form.saved", { reference: created.reference }));
      }
      onOpenChange(false);
    } catch (e) {
      feedback.error(e);
    } finally {
      setPending(null);
    }
  };

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      size="lg"
      title={po ? t("form.editTitle", { reference: po.reference }) : t("form.createTitle")}
      footer={
        <>
          <Button variant="outline" onClick={() => save("draft")} disabled={!!pending}>
            {pending === "draft" && <Loader2 className="animate-spin" />}
            {t("form.saveDraft")}
          </Button>
          <Button onClick={() => save("ordered")} disabled={!!pending}>
            {pending === "ordered" && <Loader2 className="animate-spin" />}
            {t("form.order")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="po-supplier">{t("form.supplier")}</Label>
            <Select value={supplierId ?? ""} onValueChange={setSupplierId}>
              <SelectTrigger id="po-supplier" className="w-full" aria-invalid={touched && !!errors.supplier}>
                <SelectValue placeholder={t("form.chooseSupplier")} />
              </SelectTrigger>
              <SelectContent>
                {suppliers.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {touched && errors.supplier && <p className="text-sm text-destructive">{errors.supplier}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="po-location">{t("form.location")}</Label>
            <Select value={locationId} onValueChange={setLocationId}>
              <SelectTrigger id="po-location" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {locations.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("form.items")}</Label>
          <ul className="space-y-3">
            {lines.map((line, i) => (
              <li key={line.key} className="flex flex-wrap items-center gap-2 rounded-xl border p-2 sm:border-0 sm:p-0">
                <div className="min-w-0 flex-[1_1_15rem]">
                  <ProductCombobox
                    id={`po-product-${i}`}
                    products={products.filter((p) => p.isActive)}
                    value={line.productId}
                    onChange={(pid) =>
                      setLines((ls) =>
                        ls.map((l) => (l.key === line.key ? { ...l, productId: pid, unitCost: products.find((p) => p.id === pid)?.purchasePrice } : l)),
                      )
                    }
                    placeholder={t("form.product")}
                    emptyText={tc("noResults")}
                    disabledIds={chosen}
                    invalid={touched && !line.productId}
                  />
                </div>
                <Input
                  inputMode="numeric"
                  className="num w-20 text-center"
                  aria-label={t("form.qty")}
                  value={line.qty}
                  onChange={(e) => {
                    const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                    setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, qty: Number.isNaN(n) ? 0 : n } : l)));
                  }}
                />
                <MoneyInput
                  className="w-32"
                  value={line.unitCost}
                  onChange={(v) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, unitCost: v } : l)))}
                  aria-describedby={undefined}
                />
                <span className="num w-24 text-right text-sm font-medium">{f.money((line.unitCost ?? 0) * line.qty)}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  aria-label={tc("delete")}
                  onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== line.key) : ls))}
                >
                  <Trash2 />
                </Button>
              </li>
            ))}
          </ul>
          {touched && errors.items && <p className="text-sm text-destructive">{errors.items}</p>}
          <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: seq++, qty: 5, unitCost: undefined }])}>
            <Plus />
            {t("form.addItem")}
          </Button>
        </div>
        <div className="flex items-baseline justify-between rounded-xl bg-muted/60 px-4 py-3">
          <span className="text-sm text-muted-foreground">{t("form.total")}</span>
          <span className="num text-xl font-bold">{f.money(total)}</span>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function CountUp({ from, to }: { from: number; to: number }) {
  const [reduced] = useState(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [value, setValue] = useState(reduced ? to : from);
  useEffect(() => {
    if (reduced) return;
    const start = performance.now();
    const duration = 900;
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / duration);
      setValue(Math.round(from + (to - from) * (1 - Math.pow(1 - p, 3))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [from, to, reduced]);
  return <span className="num">{value}</span>;
}

/** After "Marquer comme reçu": each item's stock counting up from its old level. */
export function ReceivedDialog({
  result,
  onClose,
}: {
  result: { po: PurchaseOrder; before: Record<ID, number> } | null;
  onClose: () => void;
}) {
  const t = useTranslations("purchases.received");
  const labels = useLabels();
  if (!result) return null;
  const { po, before } = result;
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={
        <span className="flex items-center gap-2">
          <CheckCircle2 className="size-5 text-success-text" aria-hidden="true" />
          {t("title", { reference: po.reference })}
        </span>
      }
      description={t("description", { location: labels.location(po.locationId) })}
      footer={<Button onClick={onClose}>{t("close")}</Button>}
    >
      <ul className="space-y-2">
        {po.items.map((it, i) => (
          <li
            key={it.productId}
            className="flex items-center gap-3 rounded-xl border p-3 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-1"
            style={{ animationDelay: `${i * 80}ms`, animationFillMode: "both" }}
          >
            <span className="min-w-0 flex-1 truncate text-sm font-medium">{labels.product(it.productId)}</span>
            <span className="num rounded-lg bg-success/10 px-2 py-1 text-sm font-bold text-success-text">+{it.qty}</span>
            <span className="num w-20 text-right text-sm">
              <span className="text-muted-foreground">{before[it.productId] ?? 0} → </span>
              <span className={cn("text-lg font-bold text-primary")}>
                <CountUp from={before[it.productId] ?? 0} to={(before[it.productId] ?? 0) + it.qty} />
              </span>
            </span>
          </li>
        ))}
      </ul>
    </ResponsiveDialog>
  );
}
