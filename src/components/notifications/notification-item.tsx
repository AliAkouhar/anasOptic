"use client";

import { AlertTriangle, Calculator, Glasses } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { stockKey } from "@/lib/calculations";
import type { Notification, NotificationType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useFormat, useLabels } from "@/data/hooks";
import { indexById, stockIndex } from "@/data/indexes";
import { useDb } from "@/data/store";

const ICONS: Record<NotificationType, typeof Calculator> = {
  order_costs_needed: Calculator,
  low_stock: AlertTriangle,
  order_in_store: Glasses,
};

const TONE: Record<NotificationType, string> = {
  order_costs_needed: "bg-attention/10 text-attention-text",
  low_stock: "bg-destructive/10 text-destructive",
  order_in_store: "bg-teal-500/10 text-teal-700 dark:text-teal-300",
};

/** Resolves a notification to its text and link (the target may have changed since). */
export function useNotificationContent() {
  const t = useTranslations("notifications");
  const labels = useLabels();
  const orders = useDb((db) => db.orders);
  const clients = useDb((db) => db.clients);
  const movements = useDb((db) => db.stockMovements);
  return useMemo(() => {
    const orderMap = indexById(orders);
    const clientMap = indexById(clients);
    const levels = stockIndex(movements);
    return (n: Notification): { text: string; href: string } => {
      if (n.type === "low_stock") {
        return {
          text: t("text.low_stock", {
            product: labels.product(n.refId),
            location: labels.location(n.locationId),
            qty: levels.get(stockKey(n.refId, n.locationId ?? "")) ?? 0,
          }),
          href: `/stock?product=${n.refId}&location=${n.locationId ?? ""}`,
        };
      }
      const order = orderMap.get(n.refId);
      const number = order?.invoiceNumber ?? "?";
      const location = labels.location(order?.locationId ?? n.locationId);
      if (n.type === "order_in_store") {
        return {
          text: t("text.order_in_store", { number, client: clientMap.get(order?.clientId ?? "")?.fullName ?? "—" }),
          href: `/orders/${n.refId}`,
        };
      }
      return { text: t("text.order_costs_needed", { number, location }), href: `/orders/${n.refId}#charges` };
    };
  }, [t, labels, orders, clients, movements]);
}

export function NotificationRow({
  notification,
  text,
  onOpen,
  className,
}: {
  notification: Notification;
  text: string;
  onOpen: () => void;
  className?: string;
}) {
  const t = useTranslations("notifications");
  const f = useFormat();
  const Icon = ICONS[notification.type];
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "flex w-full items-start gap-3 rounded-xl px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:bg-muted",
        !notification.read && "bg-accent/60",
        className,
      )}
    >
      <span className={cn("mt-0.5 grid size-9 shrink-0 place-items-center rounded-xl", TONE[notification.type])}>
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className={cn("block text-sm leading-snug", !notification.read && "font-medium")}>{text}</span>
        <span className="mt-1 block text-xs text-muted-foreground">
          {t(`types.${notification.type}`)} · {f.relative(notification.createdAt)}
        </span>
      </span>
      {!notification.read && <span className="mt-2 size-2 shrink-0 rounded-full bg-attention" aria-label={t("unread")} />}
    </button>
  );
}
