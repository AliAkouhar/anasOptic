"use client";

import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { MoneyInput } from "@/components/shared/money-input";
import { useAuth, useFormat, useLabels, useOptionList } from "@/data/hooks";
import { indexById, itemsByOrder, paymentsByOrder } from "@/data/indexes";
import { RepoError, ordersRepo } from "@/data/repositories";
import { getDb, useDb } from "@/data/store";
import { nextStatus, orderReste, sumAmounts } from "@/lib/calculations";
import { formatPhone } from "@/lib/format";
import { can, statusPermission } from "@/lib/permissions";
import { SUPPLIER_SOURCE, type ID } from "@/lib/types";
import { openExternal, readyWhatsAppLink } from "./whatsapp";

interface OrderActions {
  /** Moves to the next status (opens "Encaisser le reste" first when delivering with a balance due). */
  advance: (orderId: ID) => Promise<void>;
  collect: (orderId: ID, opts?: { deliver?: boolean }) => void;
  cancel: (orderId: ID) => void;
  notifyWhatsApp: (orderId: ID) => void;
  /** wa.me link when the client has WhatsApp, else null. */
  whatsappHref: (orderId: ID) => string | null;
}

const Ctx = createContext<OrderActions | null>(null);

export function useOrderActions(): OrderActions {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useOrderActions must be used inside <OrderActionsProvider>");
  return ctx;
}

function orderSnapshot(orderId: ID) {
  const db = getDb();
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) return null;
  const client = db.clients.find((c) => c.id === order.clientId);
  const location = db.locations.find((l) => l.id === order.locationId);
  const payments = paymentsByOrder(db.payments).get(orderId) ?? [];
  return { order, client, location, payments, reste: orderReste(order, payments) };
}

export function OrderActionsProvider({ children }: { children: ReactNode }) {
  const t = useTranslations();
  const auth = useAuth();
  const feedback = useFeedback();
  const [collectFor, setCollectFor] = useState<{ orderId: ID; deliver: boolean } | null>(null);
  const [cancelFor, setCancelFor] = useState<ID | null>(null);

  const whatsappHref = useCallback((orderId: ID) => {
    const s = orderSnapshot(orderId);
    if (!s?.client?.isWhatsapp || !s.location) return null;
    return readyWhatsAppLink({
      phone: s.client.phone,
      clientName: s.client.fullName,
      number: s.order.invoiceNumber,
      locationName: s.location.name,
      reste: s.reste,
    });
  }, []);

  const notifyWhatsApp = useCallback(
    (orderId: ID) => {
      const href = whatsappHref(orderId);
      if (href) openExternal(href);
    },
    [whatsappHref],
  );

  const advance = useCallback(
    async (orderId: ID) => {
      const s = orderSnapshot(orderId);
      if (!s) return;
      const next = nextStatus(s.order.status);
      if (!next) return;
      if (!can(auth, statusPermission(next))) {
        feedback.error(new RepoError("forbidden"));
        return;
      }
      if (next === "delivered" && s.reste > 0) {
        setCollectFor({ orderId, deliver: true });
        return;
      }
      try {
        const { undo } = await ordersRepo.setStatus(orderId, next);
        if (next === "in_store") {
          const href = whatsappHref(orderId);
          const title = t("orders.readyToast", { number: s.order.invoiceNumber });
          const onUndo = () => (undo() ? toast(t("common.undone")) : toast.error(t("errors.undo_failed")));
          if (href) {
            toast.success(title, {
              description: t("orders.readyToastBody", { client: s.client?.fullName ?? "" }),
              duration: 12000,
              action: { label: t("orders.whatsappNotify"), onClick: () => openExternal(href) },
              cancel: { label: t("common.undo"), onClick: onUndo },
            });
          } else {
            toast.success(title, {
              description: t("orders.noWhatsapp", { phone: formatPhone(s.client?.phone ?? "") }),
              duration: 8000,
              cancel: { label: t("common.undo"), onClick: onUndo },
            });
          }
        } else {
          feedback.success(t("orders.movedTo", { number: s.order.invoiceNumber, status: t(`status.${next}`) }), { undo });
        }
      } catch (e) {
        feedback.error(e);
      }
    },
    [auth, feedback, t, whatsappHref],
  );

  const value = useMemo<OrderActions>(
    () => ({
      advance,
      collect: (orderId, opts) => setCollectFor({ orderId, deliver: !!opts?.deliver }),
      cancel: (orderId) => setCancelFor(orderId),
      notifyWhatsApp,
      whatsappHref,
    }),
    [advance, notifyWhatsApp, whatsappHref],
  );

  return (
    <Ctx.Provider value={value}>
      {children}
      {collectFor && (
        <CollectDialog
          key={collectFor.orderId + collectFor.deliver}
          orderId={collectFor.orderId}
          deliver={collectFor.deliver}
          onClose={() => setCollectFor(null)}
        />
      )}
      {cancelFor && <CancelDialog orderId={cancelFor} onClose={() => setCancelFor(null)} />}
    </Ctx.Provider>
  );
}

function CollectDialog({ orderId, deliver, onClose }: { orderId: ID; deliver: boolean; onClose: () => void }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const feedback = useFeedback();
  const methods = useOptionList("payment_method");
  const orders = useDb((db) => db.orders);
  const payments = useDb((db) => db.payments);
  const clients = useDb((db) => db.clients);
  const order = orders.find((o) => o.id === orderId);
  const reste = order ? orderReste(order, paymentsByOrder(payments).get(orderId) ?? []) : 0;
  const client = order ? indexById(clients).get(order.clientId) : undefined;
  const [amount, setAmount] = useState<number | undefined>(reste);
  const [methodId, setMethodId] = useState(methods[0]?.id ?? "");
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);

  if (!order) return null;
  const error =
    amount === undefined || !(amount > 0)
      ? t("errors.invalid_amount")
      : amount > reste
        ? t("collect.tooMuch", { amount: f.money(reste) })
        : deliver && amount < reste
          ? t("collect.mustBeFull", { amount: f.money(reste) })
          : null;

  const submit = async () => {
    setTouched(true);
    if (error || amount === undefined) return;
    setPending(true);
    try {
      if (deliver) {
        const { undo } = await ordersRepo.collectAndDeliver(orderId, { amount, methodId });
        feedback.success(t("collect.delivered", { number: order.invoiceNumber }), { description: t("collect.done", { amount: f.money(amount) }), undo });
      } else {
        const { undo } = await ordersRepo.addPayment(orderId, { amount, methodId });
        feedback.success(t("collect.done", { amount: f.money(amount) }), { undo });
      }
      onClose();
    } catch (e) {
      feedback.error(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && !pending && onClose()}
      title={deliver ? t("collect.title") : t("collect.titlePayment")}
      description={t("collect.description", { number: order.invoiceNumber, client: client?.fullName ?? "" })}
      footer={
        <>
          <Button variant="outline" onClick={onClose} disabled={pending}>
            {t("common.cancel")}
          </Button>
          <Button variant={deliver ? "success" : "default"} onClick={submit} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {deliver ? t("collect.confirmDeliver") : t("collect.confirm")}
          </Button>
        </>
      }
    >
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {deliver && <p className="rounded-xl bg-attention/10 px-4 py-3 text-sm text-attention-text">{t("collect.deliverHint")}</p>}
        <div className="flex items-baseline justify-between rounded-xl bg-muted/60 px-4 py-3">
          <span className="text-sm text-muted-foreground">{t("money.reste")}</span>
          <span className="num text-xl font-semibold text-attention-text">{f.money(reste)}</span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="collect-amount">{t("collect.amount")}</Label>
          <MoneyInput
            id="collect-amount"
            size="lg"
            value={amount}
            onChange={setAmount}
            invalid={touched && !!error}
            aria-describedby="collect-error"
          />
          {touched && error ? (
            <p id="collect-error" className="text-sm text-destructive">
              {error}
            </p>
          ) : (
            amount !== undefined &&
            amount <= reste && (
              <p id="collect-error" className="text-sm text-muted-foreground">
                {t("collect.remaining", { amount: f.money(reste - amount) })}
              </p>
            )
          )}
        </div>
        <div className="space-y-2">
          <Label>{t("collect.method")}</Label>
          <ToggleGroup
            type="single"
            value={methodId}
            onValueChange={(v) => v && setMethodId(v)}
            variant="outline"
            className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
            spacing={2}
          >
            {methods.map((m) => (
              <ToggleGroupItem key={m.id} value={m.id} className="h-11 rounded-lg! data-[state=on]:border-primary data-[state=on]:bg-accent data-[state=on]:text-accent-foreground">
                {labels.option(m.id)}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
        </div>
      </form>
    </ResponsiveDialog>
  );
}

function CancelDialog({ orderId, onClose }: { orderId: ID; onClose: () => void }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const feedback = useFeedback();
  const orders = useDb((db) => db.orders);
  const payments = useDb((db) => db.payments);
  const items = useDb((db) => db.orderItems);
  const products = useDb((db) => db.products);
  const order = orders.find((o) => o.id === orderId);
  if (!order) return null;
  const paid = sumAmounts(paymentsByOrder(payments).get(orderId) ?? []);
  const orderItems = itemsByOrder(items).get(orderId) ?? [];
  const productMap = indexById(products);
  const hasFrame = orderItems.some((i) => productMap.get(i.productId)?.kind === "frame");
  const hasSourcedLens = orderItems.some(
    (i) => productMap.get(i.productId)?.kind === "lens" && i.sourceLocationId && i.sourceLocationId !== SUPPLIER_SOURCE,
  );

  return (
    <ConfirmDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={t("cancel.title", { number: order.invoiceNumber })}
      confirmLabel={t("cancel.confirm")}
      description={
        <>
          <p>{t("cancel.intro")}</p>
          <ul className="list-disc space-y-1 pl-5">
            {hasFrame && <li>{t("cancel.stock", { location: labels.location(order.locationId) })}</li>}
            {hasSourcedLens && <li>{t("cancel.lensStock")}</li>}
            {paid > 0 && <li>{t("cancel.refund", { amount: f.money(paid) })}</li>}
            <li>{t("cancel.revenue")}</li>
          </ul>
        </>
      }
      onConfirm={async () => {
        try {
          const { refunded } = await ordersRepo.cancel(orderId);
          feedback.success(t("cancel.done", { number: order.invoiceNumber }), {
            description: t("cancel.doneBody", { amount: f.money(refunded) }),
          });
        } catch (e) {
          feedback.error(e);
        }
      }}
    />
  );
}
