"use client";

import { Star } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormat } from "@/data/hooks";
import type { ClientSegment, OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

/** One colour per status, used everywhere (badges, board columns, charts). */
export const STATUS_BADGE: Record<OrderStatus, string> = {
  confirmed: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/15 dark:text-blue-300 dark:ring-blue-400/20",
  workshop: "bg-violet-50 text-violet-700 ring-violet-600/15 dark:bg-violet-500/15 dark:text-violet-300 dark:ring-violet-400/20",
  prepared: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300 dark:ring-amber-400/20",
  in_store: "bg-teal-50 text-teal-700 ring-teal-600/15 dark:bg-teal-500/15 dark:text-teal-300 dark:ring-teal-400/20",
  delivered: "bg-green-50 text-green-700 ring-green-600/15 dark:bg-green-500/15 dark:text-green-300 dark:ring-green-400/20",
  cancelled: "bg-slate-100 text-red-700 ring-slate-500/20 dark:bg-slate-500/15 dark:text-red-300 dark:ring-slate-400/20",
};

export const STATUS_DOT: Record<OrderStatus, string> = {
  confirmed: "bg-status-confirmed",
  workshop: "bg-status-workshop",
  prepared: "bg-status-prepared",
  in_store: "bg-status-in_store",
  delivered: "bg-status-delivered",
  cancelled: "bg-status-cancelled",
};

export const STATUS_BORDER: Record<OrderStatus, string> = {
  confirmed: "border-t-status-confirmed",
  workshop: "border-t-status-workshop",
  prepared: "border-t-status-prepared",
  in_store: "border-t-status-in_store",
  delivered: "border-t-status-delivered",
  cancelled: "border-t-status-cancelled",
};

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  const t = useTranslations("status");
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        STATUS_BADGE[status],
        className,
      )}
    >
      <span className={cn("size-1.5 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
      {t(status)}
    </span>
  );
}

const SEGMENT_BADGE: Record<ClientSegment, string> = {
  new: "bg-slate-100 text-slate-700 ring-slate-500/15 dark:bg-slate-500/15 dark:text-slate-300",
  regular: "bg-sky-50 text-sky-800 ring-sky-600/15 dark:bg-sky-500/15 dark:text-sky-300",
  loyal: "bg-amber-50 text-amber-800 ring-amber-600/20 dark:bg-amber-500/15 dark:text-amber-300",
};

export function SegmentBadge({ segment, className }: { segment: ClientSegment; className?: string }) {
  const t = useTranslations("segment");
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        SEGMENT_BADGE[segment],
        className,
      )}
    >
      {segment === "loyal" && <Star className="size-3 fill-current" aria-hidden="true" />}
      {t(segment)}
    </span>
  );
}

export function Money({ value, className }: { value: number; className?: string }) {
  const f = useFormat();
  return <span className={cn("num whitespace-nowrap", className)}>{f.money(value)}</span>;
}

/** Reste: orange while something is due, green once paid in full. */
export function ResteBadge({ reste, className, compact }: { reste: number; className?: string; compact?: boolean }) {
  const t = useTranslations("money");
  const f = useFormat();
  const due = reste > 0;
  return (
    <span
      className={cn(
        "num inline-flex h-6 shrink-0 items-center rounded-full px-2.5 text-xs font-semibold whitespace-nowrap",
        due ? "bg-attention/10 text-attention-text" : "bg-success/10 text-success-text",
        className,
      )}
    >
      {due ? (compact ? f.money(reste) : t("resteShort", { amount: f.money(reste) })) : t("paid")}
    </span>
  );
}

export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={cn("size-4 shrink-0", className)} fill="currentColor" aria-hidden="true">
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38a9.9 9.9 0 0 0 4.74 1.21h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.84 9.84 0 0 0 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.2 8.2 0 0 1-1.26-4.38c0-4.54 3.7-8.24 8.25-8.24 2.2 0 4.27.86 5.82 2.42a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.23 8.23Zm4.52-6.16c-.25-.12-1.46-.72-1.69-.8-.23-.08-.39-.12-.56.12-.16.25-.64.8-.78.97-.14.16-.29.18-.54.06-.25-.12-1.04-.38-1.99-1.23-.73-.66-1.23-1.46-1.37-1.71-.14-.25-.02-.38.11-.5.11-.11.25-.29.37-.43.12-.14.16-.25.25-.41.08-.16.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.41-.42-.56-.43h-.48a.92.92 0 0 0-.66.31c-.23.25-.87.85-.87 2.07 0 1.22.89 2.4 1.01 2.56.12.16 1.75 2.67 4.23 3.74.59.26 1.05.41 1.41.52.59.19 1.13.16 1.56.1.48-.07 1.46-.6 1.67-1.18.21-.58.21-1.07.14-1.18-.06-.1-.22-.16-.47-.28Z" />
    </svg>
  );
}
