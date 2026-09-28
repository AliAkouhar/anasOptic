"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { STATUS_DOT } from "@/components/shared/badges";
import { useCan } from "@/data/hooks";
import type { OrderView } from "@/data/indexes";
import { Link } from "@/i18n/navigation";
import { nextStatus } from "@/lib/calculations";
import { statusPermission } from "@/lib/permissions";
import { STATUS_FLOW, type OrderStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useOrderActions } from "./order-actions";
import { OrderCard } from "./order-card";

const DAY = 86_400_000;
const DELIVERED_WINDOW_DAYS = 7;
const CANCELLED_WINDOW_DAYS = 30;
const COLUMN_LIMIT = 40;

function DraggableCard({
  view,
  now,
  showLocation,
  showCosts,
  canMove,
  onAdvance,
}: {
  view: OrderView;
  now: Date;
  showLocation: boolean;
  showCosts: boolean;
  canMove: boolean;
  onAdvance: () => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: view.order.id,
    data: { status: view.order.status },
    disabled: !canMove,
  });
  return (
    <OrderCard
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      view={view}
      now={now}
      showLocation={showLocation}
      showCosts={showCosts}
      canAdvance={canMove}
      onAdvance={onAdvance}
      className={cn(canMove && "cursor-grab active:cursor-grabbing", isDragging && "opacity-40")}
    />
  );
}

function Column({
  status,
  views,
  total,
  highlight,
  children,
}: {
  status: OrderStatus;
  views: OrderView[];
  total: number;
  highlight: "valid" | "invalid" | null;
  children: React.ReactNode;
}) {
  const t = useTranslations();
  const { setNodeRef, isOver } = useDroppable({ id: status });
  return (
    <section
      ref={setNodeRef}
      aria-label={t(`status.${status}`)}
      className={cn(
        "flex w-[82vw] max-w-[320px] shrink-0 snap-center flex-col rounded-2xl bg-muted/50 p-2 transition-colors sm:w-72 xl:w-auto xl:max-w-none xl:min-w-[208px] xl:flex-1 xl:shrink",
        highlight === "valid" && "bg-accent outline-2 outline-offset-2 outline-primary/50 outline-dashed",
        highlight === "valid" && isOver && "outline-primary outline-solid",
        highlight === "invalid" && isOver && "outline-2 outline-destructive/40 outline-dashed",
      )}
    >
      <header className="flex items-center gap-2 px-2 pt-1 pb-2.5">
        <span className={cn("size-2.5 rounded-full", STATUS_DOT[status])} aria-hidden="true" />
        <h2 className="text-sm font-semibold">{t(`status.${status}`)}</h2>
        <span className="num ml-auto rounded-full bg-background px-2 py-0.5 text-xs font-semibold text-muted-foreground">{total}</span>
      </header>
      {status === "delivered" && <p className="-mt-1 px-2 pb-2 text-xs text-muted-foreground">{t("orders.deliveredRecent")}</p>}
      <div className="flex min-h-24 flex-1 flex-col gap-2">
        {views.length === 0 ? (
          <p className="grid flex-1 place-items-center rounded-xl border border-dashed py-6 text-xs text-muted-foreground">{t("orders.columnEmpty")}</p>
        ) : (
          children
        )}
      </div>
    </section>
  );
}

export function OrderBoard({
  views,
  now,
  showLocation,
  showCosts,
  showCancelled,
  loading,
}: {
  views: OrderView[];
  now: Date;
  showLocation: boolean;
  showCosts: boolean;
  showCancelled: boolean;
  loading?: boolean;
}) {
  const t = useTranslations();
  const can = useCan();
  const actions = useOrderActions();
  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 220, tolerance: 8 } }),
    useSensor(KeyboardSensor),
  );

  const columns = useMemo(() => {
    const statuses: OrderStatus[] = [...STATUS_FLOW, ...(showCancelled ? (["cancelled"] as const) : [])];
    const nowMs = now.getTime();
    return statuses.map((status) => {
      let list = views.filter((v) => v.order.status === status);
      if (status === "delivered") list = list.filter((v) => nowMs - Date.parse(v.statusSince) <= DELIVERED_WINDOW_DAYS * DAY);
      if (status === "cancelled") list = list.filter((v) => nowMs - Date.parse(v.statusSince) <= CANCELLED_WINDOW_DAYS * DAY);
      // Oldest first in active columns (late ones on top); newest first once finished.
      list.sort((a, b) =>
        status === "delivered" || status === "cancelled" ? b.statusSince.localeCompare(a.statusSince) : a.statusSince.localeCompare(b.statusSince),
      );
      return { status, list, total: list.length };
    });
  }, [views, showCancelled, now]);

  const activeView = activeId ? views.find((v) => v.order.id === activeId) : undefined;
  const activeNext = activeView ? nextStatus(activeView.order.status) : null;
  const canMove = (v: OrderView) => {
    const next = nextStatus(v.order.status);
    return !!next && can(statusPermission(next));
  };

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const to = e.over?.id as OrderStatus | undefined;
    const from = e.active.data.current?.status as OrderStatus | undefined;
    if (!to || !from || to === from) return;
    if (nextStatus(from) !== to) {
      toast.error(t("orders.moveOneStep"));
      return;
    }
    void actions.advance(String(e.active.id));
  };

  if (loading) {
    return (
      <div className="flex gap-3 overflow-hidden" aria-busy="true">
        {STATUS_FLOW.map((s) => (
          <div key={s} className="w-72 shrink-0 space-y-2 rounded-2xl bg-muted/50 p-2 xl:w-auto xl:flex-1">
            <Skeleton className="h-6 w-32" />
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="h-32 rounded-xl" />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <DndContext
      sensors={sensors}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
      accessibility={{ screenReaderInstructions: { draggable: t("orders.dragHint") } }}
    >
      <p className="mb-3 hidden text-xs text-muted-foreground md:block">{t("orders.dragHint")}</p>
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-4 pb-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 xl:mx-0 xl:px-0">
        {columns.map(({ status, list, total }) => (
          <Column
            key={status}
            status={status}
            views={list}
            total={total}
            highlight={activeId ? (status === activeNext ? "valid" : status === activeView?.order.status ? null : "invalid") : null}
          >
            {list.slice(0, COLUMN_LIMIT).map((v) => (
              <DraggableCard
                key={v.order.id}
                view={v}
                now={now}
                showLocation={showLocation}
                showCosts={showCosts}
                canMove={canMove(v)}
                onAdvance={() => void actions.advance(v.order.id)}
              />
            ))}
            {list.length > COLUMN_LIMIT && (
              <Link href={`/orders?view=list&status=${status}`} className="rounded-lg px-2 py-2 text-center text-xs font-medium text-primary hover:underline">
                {t("orders.moreInColumn", { count: list.length - COLUMN_LIMIT })}
              </Link>
            )}
            {status === "delivered" && (
              <Link href="/orders?view=list&status=delivered" className="rounded-lg px-2 py-2 text-center text-xs font-medium text-primary hover:underline">
                {t("orders.seeAllDelivered")}
              </Link>
            )}
          </Column>
        ))}
      </div>
      <DragOverlay dropAnimation={{ duration: 180, easing: "ease-out" }}>
        {activeView ? <OrderCard view={activeView} now={now} showLocation={showLocation} showCosts={showCosts} dragging /> : null}
      </DragOverlay>
    </DndContext>
  );
}
