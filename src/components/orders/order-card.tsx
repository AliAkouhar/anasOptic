"use client";

import { ArrowRight, Clock } from "lucide-react";
import { useTranslations } from "next-intl";
import { forwardRef, type HTMLAttributes } from "react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ResteBadge, StatusBadge, WhatsAppIcon } from "@/components/shared/badges";
import { useFormat } from "@/data/hooks";
import type { OrderView } from "@/data/indexes";
import { Link } from "@/i18n/navigation";
import { daysInStatus, nextStatus } from "@/lib/calculations";
import { shortLocationName } from "@/lib/format";
import { cn } from "@/lib/utils";

export const LATE_AFTER_DAYS = 5;

export interface OrderCardProps extends HTMLAttributes<HTMLDivElement> {
  view: OrderView;
  now: Date;
  showLocation?: boolean;
  showCosts?: boolean;
  showStatus?: boolean;
  onAdvance?: () => void;
  canAdvance?: boolean;
  dragging?: boolean;
}

/** Board card: N°, client, total, reste, days in status (red after 5 days), WhatsApp, costs dot. */
export const OrderCard = forwardRef<HTMLDivElement, OrderCardProps>(function OrderCard(
  { view, now, showLocation, showCosts, showStatus, onAdvance, canAdvance, dragging, className, ...rest },
  ref,
) {
  const t = useTranslations();
  const f = useFormat();
  const { order, client } = view;
  const days = daysInStatus(view.statusSince, now);
  const active = order.status !== "delivered" && order.status !== "cancelled";
  const late = active && days > LATE_AFTER_DAYS;
  const next = nextStatus(order.status);

  return (
    <div
      ref={ref}
      {...rest}
      className={cn(
        "group relative rounded-xl border bg-card p-3 shadow-soft transition-shadow",
        dragging && "rotate-1 shadow-lift ring-2 ring-primary",
        className,
      )}
    >
      <div className="flex items-center gap-2">
        <Link
          href={`/orders/${order.id}`}
          className="num text-sm font-semibold text-primary after:absolute after:inset-0 after:rounded-xl focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring"
          draggable={false}
        >
          {t("orders.number")} {order.invoiceNumber}
        </Link>
        {showLocation && view.location && (
          <span className="truncate rounded-md bg-muted px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
            {shortLocationName(view.location.name)}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1.5">
          {showCosts && !order.costsCompleted && order.status !== "cancelled" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="relative z-10 size-2.5 rounded-full bg-attention ring-2 ring-attention/25" aria-label={t("orders.costsMissing")} role="img" />
              </TooltipTrigger>
              <TooltipContent>{t("orders.costsMissing")}</TooltipContent>
            </Tooltip>
          )}
          {client?.isWhatsapp && <WhatsAppIcon className="size-4 text-whatsapp" />}
        </span>
      </div>
      <p className="mt-1.5 truncate font-medium">{client?.fullName ?? "—"}</p>
      <div className="mt-2 flex items-center justify-between gap-2">
        <span className="num text-sm text-muted-foreground">{f.money(order.total)}</span>
        {order.status !== "cancelled" && <ResteBadge reste={view.reste} compact={false} />}
      </div>
      <div className="mt-2 flex items-center justify-between gap-2">
        {showStatus ? (
          <StatusBadge status={order.status} />
        ) : (
          <span className={cn("flex items-center gap-1 text-xs", late ? "font-semibold text-destructive" : "text-muted-foreground")}>
            <Clock className="size-3.5" aria-hidden="true" />
            {t("orders.daysInStatus", { count: days })}
            {late && <span className="sr-only">({t("orders.late")})</span>}
          </span>
        )}
      </div>
      {canAdvance && next && onAdvance && (
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="relative z-10 mt-3 w-full justify-between md:hidden"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onAdvance();
          }}
        >
          {t(`statusNext.${next}`)}
          <ArrowRight />
        </Button>
      )}
    </div>
  );
});
