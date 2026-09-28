"use client";

import { Check, X } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormat, useLabels } from "@/data/hooks";
import { STATUS_FLOW, type OrderStatus, type OrderStatusEvent } from "@/lib/types";
import { cn } from "@/lib/utils";
import { STATUS_DOT } from "@/components/shared/badges";

/** Steps confirmed → delivered with who/when, plus a red end node when cancelled. */
export function StatusTimeline({ status, events }: { status: OrderStatus; events: OrderStatusEvent[] }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const byStatus = new Map(events.map((e) => [e.to, e]));
  const cancelled = byStatus.get("cancelled");
  const reachedIndex = cancelled
    ? Math.max(...STATUS_FLOW.map((s, i) => (byStatus.has(s) ? i : -1)))
    : STATUS_FLOW.indexOf(status as (typeof STATUS_FLOW)[number]);
  const steps: { key: OrderStatus; event?: OrderStatusEvent; state: "done" | "current" | "todo" | "cancelled" }[] = STATUS_FLOW.map((s, i) => ({
    key: s,
    event: byStatus.get(s),
    state: i < reachedIndex || (i === reachedIndex && s === "delivered") ? "done" : i === reachedIndex ? (cancelled ? "done" : "current") : "todo",
  }));
  const visible = cancelled ? [...steps.slice(0, reachedIndex + 1), { key: "cancelled" as const, event: cancelled, state: "cancelled" as const }] : steps;

  return (
    <ol className="grid gap-0 sm:grid-flow-col sm:auto-cols-fr" aria-label={t("detail.timeline")}>
      {visible.map((step, i) => {
        const last = i === visible.length - 1;
        return (
          <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0 sm:flex-col sm:items-start sm:gap-2 sm:pr-3 sm:pb-0">
            {!last && (
              <span
                className={cn(
                  "absolute top-9 bottom-0 left-[17px] w-0.5 sm:top-[17px] sm:right-0 sm:bottom-auto sm:left-9 sm:h-0.5 sm:w-auto",
                  step.state === "done" ? "bg-primary" : "bg-border",
                )}
                aria-hidden="true"
              />
            )}
            <span
              className={cn(
                "relative z-10 grid size-9 shrink-0 place-items-center rounded-full border-2 bg-card",
                step.state === "done" && "border-primary bg-primary text-primary-foreground",
                step.state === "current" && "border-primary text-primary",
                step.state === "todo" && "border-border text-muted-foreground",
                step.state === "cancelled" && "border-destructive bg-destructive text-white",
              )}
            >
              {step.state === "done" ? (
                <Check className="size-4" aria-hidden="true" />
              ) : step.state === "cancelled" ? (
                <X className="size-4" aria-hidden="true" />
              ) : (
                <span className={cn("size-2.5 rounded-full", step.state === "current" ? cn(STATUS_DOT[step.key], "motion-safe:animate-pulse") : "bg-border")} />
              )}
            </span>
            <span className="min-w-0 pt-1 sm:pt-0">
              <span className={cn("block text-sm font-semibold", step.state === "todo" && "text-muted-foreground", step.state === "cancelled" && "text-destructive")}>
                {t(`status.${step.key}`)}
              </span>
              {step.event ? (
                <span className="block text-xs text-muted-foreground">
                  <span className="num">{f.dateTime(step.event.createdAt)}</span>
                  <br className="hidden sm:block" />
                  <span className="sm:hidden"> · </span>
                  {labels.user(step.event.userId)}
                </span>
              ) : (
                <span className="block text-xs text-muted-foreground">{t("detail.pending")}</span>
              )}
            </span>
            {step.state === "current" && <span className="sr-only">({t("detail.currentStep")})</span>}
          </li>
        );
      })}
    </ol>
  );
}
