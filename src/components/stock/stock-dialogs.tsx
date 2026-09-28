"use client";

import { ExternalLink, Loader2, Minus, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { useCan, useFormat, useLabels, useRequiredAuth } from "@/data/hooks";
import { movementsByProduct, stockIndex } from "@/data/indexes";
import { stockRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { useIsMobile } from "@/hooks/use-media-query";
import { Link } from "@/i18n/navigation";
import { stockKey } from "@/lib/calculations";
import { canViewOrder } from "@/lib/permissions";
import type { ID, StockMovement } from "@/lib/types";
import { cn } from "@/lib/utils";

/** Side drawer: every movement of a product at one location, with a running balance. */
export function MovementsDrawer({ productId, locationId, onClose }: { productId: ID | null; locationId: ID; onClose: () => void }) {
  const t = useTranslations("stock");
  const f = useFormat();
  const labels = useLabels();
  const can = useCan();
  const auth = useRequiredAuth();
  const isMobile = useIsMobile();
  const movements = useDb((db) => db.stockMovements);
  const orders = useDb((db) => db.orders);
  const list = useMemo(() => {
    if (!productId) return [];
    const rows = (movementsByProduct(movements).get(productId) ?? []).filter((m) => m.locationId === locationId);
    const sorted = [...rows].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    let balance = 0;
    const withBalance = sorted.map((m) => ({ m, balance: (balance += m.qty) }));
    return withBalance.reverse();
  }, [movements, productId, locationId]);
  const level = productId ? (stockIndex(movements).get(stockKey(productId, locationId)) ?? 0) : 0;

  const linkFor = (m: StockMovement): string | null => {
    if (!m.refId) return null;
    if (m.reason === "order" || m.reason === "order_cancel") {
      const order = orders.find((o) => o.id === m.refId);
      return order && canViewOrder(auth, order) ? `/orders/${m.refId}` : null;
    }
    if (m.reason === "transfer_in" || m.reason === "transfer_out") return can("stock.transfer") ? "/stock/transfers" : null;
    if (m.reason === "purchase") return can("purchases.manage") ? "/purchases" : null;
    return null;
  };
  const refLabel = (m: StockMovement) => {
    if (m.reason === "order" || m.reason === "order_cancel") {
      const order = orders.find((o) => o.id === m.refId);
      return order ? `N° ${order.invoiceNumber}` : null;
    }
    return null;
  };

  return (
    <Sheet open={!!productId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side={isMobile ? "bottom" : "right"} className={cn("gap-0 p-0", isMobile ? "h-[90dvh] rounded-t-3xl" : "w-full sm:max-w-md")}>
        <SheetHeader className="border-b p-5 pr-12">
          <SheetTitle className="text-lg font-semibold">{labels.product(productId ?? undefined)}</SheetTitle>
          <SheetDescription>
            {t("drawer.title")} {t("drawer.at", { location: labels.location(locationId) })}
          </SheetDescription>
          <p className={cn("num mt-2 text-2xl font-bold", level <= 0 ? "text-destructive" : "text-foreground")}>{t("drawer.level", { count: level })}</p>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto">
          {list.length === 0 ? (
            <p className="p-5 text-sm text-muted-foreground">{t("drawer.empty")}</p>
          ) : (
            <ul className="divide-y">
              {list.map(({ m, balance }) => {
                const href = linkFor(m);
                const ref = refLabel(m);
                return (
                  <li key={m.id} className="flex items-center gap-3 px-5 py-3">
                    <span
                      className={cn(
                        "num grid h-9 min-w-12 place-items-center rounded-lg px-2 text-sm font-bold",
                        m.qty > 0 ? "bg-success/10 text-success-text" : "bg-destructive/10 text-destructive",
                      )}
                    >
                      {m.qty > 0 ? `+${m.qty}` : `−${Math.abs(m.qty)}`}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {t(`reasons.${m.reason}`)}
                        {ref && <span className="num text-muted-foreground"> · {ref}</span>}
                      </span>
                      <span className="num block truncate text-xs text-muted-foreground">
                        {f.dateTime(m.createdAt)} · {labels.user(m.userId)}
                        {m.note ? ` · ${m.note}` : ""}
                      </span>
                    </span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="num text-xs text-muted-foreground" title={t("drawer.balance")}>
                        = {balance}
                      </span>
                      {href && (
                        <Button asChild variant="ghost" size="icon-sm" aria-label={t("drawer.open")}>
                          <Link href={href}>
                            <ExternalLink />
                          </Link>
                        </Button>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

/** Manual stock correction with a mandatory reason. */
export function AdjustDialog({ target, onClose }: { target: { productId: ID; locationId: ID } | null; onClose: () => void }) {
  const t = useTranslations("stock.adjustDialog");
  const tc = useTranslations("common");
  const labels = useLabels();
  const feedback = useFeedback();
  const movements = useDb((db) => db.stockMovements);
  const [delta, setDelta] = useState(0);
  const [reason, setReason] = useState("");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const current = target ? (stockIndex(movements).get(stockKey(target.productId, target.locationId)) ?? 0) : 0;
  const after = current + delta;
  const presets = ["inventory", "breakage", "supplierReturn", "entryError"] as const;
  const errors = { delta: delta === 0 ? t("deltaRequired") : after < 0 ? t("deltaRequired") : null, reason: reason.trim() ? null : t("reasonRequired") };

  const close = () => {
    setDelta(0);
    setReason("");
    setTouched(false);
    onClose();
  };

  const submit = async () => {
    setTouched(true);
    if (!target || errors.delta || errors.reason) return;
    setPending(true);
    try {
      const { undo } = await stockRepo.adjust({ ...target, delta, note: reason });
      feedback.success(t("done", { product: labels.product(target.productId), delta: delta > 0 ? `+${delta}` : `−${Math.abs(delta)}` }), { undo });
      close();
    } catch (e) {
      feedback.error(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <ResponsiveDialog
      open={!!target}
      onOpenChange={(o) => !o && close()}
      title={t("title")}
      description={target ? t("description", { product: labels.product(target.productId), location: labels.location(target.locationId) }) : undefined}
      footer={
        <>
          <Button variant="outline" onClick={close}>
            {tc("cancel")}
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("confirm")}
          </Button>
        </>
      }
    >
      <div className="space-y-5">
        <div className="grid grid-cols-3 items-center gap-3 rounded-xl bg-muted/60 p-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">{t("current")}</p>
            <p className="num text-2xl font-bold">{current}</p>
          </div>
          <div className="num text-lg font-semibold text-muted-foreground">{delta >= 0 ? `+${delta}` : `−${Math.abs(delta)}`}</div>
          <div>
            <p className="text-xs text-muted-foreground">{t("after")}</p>
            <p className={cn("num text-2xl font-bold", after < 0 ? "text-destructive" : "text-primary")}>{after}</p>
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="adjust-delta">{t("delta")}</Label>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="icon" onClick={() => setDelta((d) => d - 1)} aria-label="−1">
              <Minus />
            </Button>
            <Input
              id="adjust-delta"
              inputMode="numeric"
              className="num text-center text-lg font-semibold"
              value={delta === 0 ? "0" : delta > 0 ? `+${delta}` : String(delta)}
              onChange={(e) => {
                const n = parseInt(e.target.value.replace(/[^\d-]/g, ""), 10);
                setDelta(Number.isNaN(n) ? 0 : n);
              }}
              aria-invalid={touched && !!errors.delta}
            />
            <Button type="button" variant="outline" size="icon" onClick={() => setDelta((d) => d + 1)} aria-label="+1">
              <Plus />
            </Button>
          </div>
          <p className={cn("text-xs", touched && errors.delta ? "text-destructive" : "text-muted-foreground")}>{touched && errors.delta ? errors.delta : t("deltaHint")}</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="adjust-reason">{t("reason")}</Label>
          <ChoiceChips
            label={t("reason")}
            value={presets.map((p) => t(`presets.${p}`)).includes(reason) ? reason : undefined}
            onChange={setReason}
            options={presets.map((p) => ({ value: t(`presets.${p}`), label: t(`presets.${p}`) }))}
            itemClassName="h-9 px-3 pointer-coarse:h-10"
          />
          <Input id="adjust-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder={t("reasonPlaceholder")} aria-invalid={touched && !!errors.reason} />
          {touched && errors.reason && <p className="text-sm text-destructive">{errors.reason}</p>}
        </div>
      </div>
    </ResponsiveDialog>
  );
}
