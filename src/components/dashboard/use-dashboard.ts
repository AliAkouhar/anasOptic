"use client";

import {
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  startOfYear,
  subDays,
  subMonths,
} from "date-fns";
import { useMemo } from "react";
import {
  activityHeatmap,
  bucketStart,
  computeKpis,
  computeLeadTimes,
  fixedChargesForRange,
  inRange,
  normalizeRange,
  orderReste,
  percentDelta,
  pickGranularity,
  shiftRange,
  stockKey,
  stockState,
  sumAmounts,
  type Comparison,
  type DateRange,
  type Granularity,
  type Kpis,
  type LeadTimes,
} from "@/lib/calculations";
import type { ClientSegment, DB, ID, Location, Order } from "@/lib/types";
import { clientStats, costsByOrder, eventsByOrder, indexById, itemsByOrder, paymentsByOrder, stockIndex } from "@/data/indexes";

export type Preset = "today" | "last7" | "thisMonth" | "lastMonth" | "thisYear" | "custom";

export function presetRange(preset: Preset, now: Date, custom?: DateRange): DateRange {
  switch (preset) {
    case "today":
      return { from: startOfDay(now), to: endOfDay(now) };
    case "last7":
      return { from: startOfDay(subDays(now, 6)), to: endOfDay(now) };
    case "thisMonth":
      return { from: startOfMonth(now), to: endOfDay(now) };
    case "lastMonth": {
      const m = subMonths(now, 1);
      return { from: startOfMonth(m), to: endOfMonth(m) };
    }
    case "thisYear":
      return { from: startOfYear(now), to: endOfDay(now) };
    case "custom":
      return normalizeRange(custom ?? { from: startOfMonth(now), to: now });
  }
}

export type SeriesKey = "revenue" | "grossMargin" | "netMargin" | "orders" | "avgBasket" | "outstanding" | "cancellationRate";

export interface Bucket {
  start: Date;
  revenue: number;
  grossMargin: number;
  netMargin: number;
  orders: number;
  avgBasket: number;
  outstanding: number;
  cancellationRate: number;
}

export type BucketGranularity = Granularity | "hour";

/** Buckets covering the range, with every KPI computed per bucket (for sparklines & the revenue chart). */
function buildBuckets(db: DB, range: DateRange, g: BucketGranularity, locationIds: ID[]): Bucket[] {
  const r = normalizeRange(range);
  const starts: Date[] = [];
  if (g === "hour") {
    for (let h = 9; h <= 20; h++) starts.push(new Date(r.from.getFullYear(), r.from.getMonth(), r.from.getDate(), h));
  } else {
    for (let d = bucketStart(r.from, g); d <= r.to; ) {
      starts.push(d);
      const next = new Date(d);
      if (g === "day") next.setDate(next.getDate() + 1);
      else if (g === "week") next.setDate(next.getDate() + 7);
      else next.setMonth(next.getMonth() + 1);
      d = next;
    }
  }
  const index = new Map(starts.map((s, i) => [s.getTime(), i]));
  const acc = starts.map(() => ({ revenue: 0, costs: 0, orders: 0, cancelled: 0, outstanding: 0 }));
  const pays = paymentsByOrder(db.payments);
  const costs = costsByOrder(db.orderCosts);
  for (const o of db.orders) {
    if (!locationIds.includes(o.locationId) || !inRange(o.createdAt, r)) continue;
    const d = new Date(o.createdAt);
    const key = g === "hour" ? new Date(d.getFullYear(), d.getMonth(), d.getDate(), d.getHours()).getTime() : bucketStart(d, g).getTime();
    const i = index.get(key);
    if (i === undefined) continue;
    if (o.status === "cancelled") {
      acc[i].cancelled++;
      continue;
    }
    acc[i].orders++;
    acc[i].revenue += o.total;
    acc[i].outstanding += Math.max(0, orderReste(o, pays.get(o.id) ?? []));
    if (o.costsCompleted) acc[i].costs += sumAmounts(costs.get(o.id) ?? []);
  }
  return starts.map((start, i) => {
    const a = acc[i];
    const end = i + 1 < starts.length ? new Date(starts[i + 1].getTime() - 1) : r.to;
    const fixed = g === "hour" ? 0 : fixedChargesForRange(db.fixedCharges, { from: start < r.from ? r.from : start, to: end > r.to ? r.to : end }, locationIds);
    const gross = a.revenue - a.costs;
    return {
      start,
      revenue: a.revenue,
      grossMargin: gross,
      netMargin: gross - fixed,
      orders: a.orders,
      avgBasket: a.orders ? a.revenue / a.orders : 0,
      outstanding: a.outstanding,
      cancellationRate: a.orders + a.cancelled ? a.cancelled / (a.orders + a.cancelled) : 0,
    };
  });
}

function kpisFor(db: DB, range: DateRange, locationIds: ID[]): Kpis {
  return computeKpis({
    orders: db.orders,
    paymentsByOrder: paymentsByOrder(db.payments),
    costsByOrder: costsByOrder(db.orderCosts),
    fixedCharges: db.fixedCharges,
    range,
    locationIds,
  });
}

export interface LocationRow {
  location: Location;
  kpis: Kpis;
  prevRevenue: number | null;
  share: number;
  delta: number | null;
  stockValue: number;
  lead: LeadTimes;
}

/** What the top of the dashboard needs: KPIs and their time series. */
export interface DashboardCore {
  range: DateRange;
  prevRange: DateRange | null;
  granularity: BucketGranularity;
  kpis: Kpis;
  prevKpis: Kpis | null;
  buckets: Bucket[];
  prevBuckets: Bucket[] | null;
  locationIds: ID[];
}

/** Period breakdowns for the charts further down (computed only when a chart mounts). */
export interface PeriodMix {
  heatmap: number[][];
  /** True when the period was too short and the heatmap uses the last 90 days instead. */
  heatmapExtended: boolean;
  brands: { id: ID; count: number }[];
  categories: { id: ID; count: number }[];
  frameCount: number;
  itemCount: number;
  lead: LeadTimes;
  segments: Record<ClientSegment, number>;
  served: number;
  returning: number;
}

/** Current-state lists (not period-bound). */
export interface ActionLists {
  pickup: { order: Order; reste: number; since: string }[];
  noCosts: Order[];
  lowStock: { productId: ID; locationId: ID; qty: number; min: number }[];
}

export function useDashboardCore(
  db: DB,
  opts: { preset: Preset; custom?: DateRange; locationIds: ID[]; comparison: Comparison; now: Date },
): DashboardCore {
  const { preset, custom, locationIds, comparison, now } = opts;
  const dayKey = startOfDay(now).getTime();
  return useMemo(() => {
    const range = presetRange(preset, new Date(), custom);
    const prevRange = shiftRange(range, comparison);
    const days = Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000);
    const granularity: BucketGranularity = days < 1 ? "hour" : pickGranularity(range);
    return {
      range,
      prevRange,
      granularity,
      kpis: kpisFor(db, range, locationIds),
      prevKpis: prevRange ? kpisFor(db, prevRange, locationIds) : null,
      buckets: buildBuckets(db, range, granularity, locationIds),
      prevBuckets: prevRange ? buildBuckets(db, prevRange, granularity, locationIds) : null,
      locationIds,
    };
    // `now` only matters per day; the rest are table references.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db, preset, custom, locationIds, comparison, dayKey]);
}

// Sections share results through a cache keyed by the database snapshot + the filters,
// so several charts reading the same section compute it once.
const sectionCache = new WeakMap<DB, Map<string, unknown>>();
function cached<T>(db: DB, key: string, compute: () => T): T {
  let map = sectionCache.get(db);
  if (!map) {
    map = new Map();
    sectionCache.set(db, map);
  }
  if (!map.has(key)) map.set(key, compute());
  return map.get(key) as T;
}
const rangeKey = (r: DateRange | null) => (r ? `${r.from.getTime()}-${r.to.getTime()}` : "-");

function liveOrders(db: DB, range: DateRange, locationIds: ID[]): Order[] {
  return cached(db, `live|${rangeKey(range)}|${locationIds.join()}`, () =>
    db.orders.filter((o) => o.status !== "cancelled" && locationIds.includes(o.locationId) && inRange(o.createdAt, range)),
  );
}

export function getLocationRows(db: DB, core: DashboardCore): LocationRow[] {
  return cached(db, `loc|${rangeKey(core.range)}|${rangeKey(core.prevRange)}|${core.locationIds.join()}`, () => {
    const events = eventsByOrder(db.orderStatusEvents);
    const levels = stockIndex(db.stockMovements);
    const productMap = indexById(db.products);
    const locationMap = indexById(db.locations);
    const live = liveOrders(db, core.range, core.locationIds);
    return core.locationIds
      .map((id) => locationMap.get(id))
      .filter((l): l is Location => !!l)
      .map((location) => {
        const k = kpisFor(db, core.range, [location.id]);
        const prev = core.prevRange ? kpisFor(db, core.prevRange, [location.id]).revenue : null;
        let stockValue = 0;
        for (const [key, qty] of levels) {
          const [pid, lid] = key.split("|");
          if (lid === location.id && qty > 0) stockValue += qty * (productMap.get(pid)?.purchasePrice ?? 0);
        }
        return {
          location,
          kpis: k,
          prevRevenue: prev,
          share: core.kpis.revenue ? k.revenue / core.kpis.revenue : 0,
          delta: prev === null ? null : percentDelta(k.revenue, prev),
          stockValue,
          lead: computeLeadTimes(events, live.filter((o) => o.locationId === location.id).map((o) => o.id)),
        };
      });
  });
}

export function getPeriodMix(db: DB, core: DashboardCore): PeriodMix {
  return cached(db, `mix|${rangeKey(core.range)}|${core.locationIds.join()}|${db.loyalty.regularMinOrders}-${db.loyalty.loyalMinOrders}`, () => {
    const { range, locationIds } = core;
    const live = liveOrders(db, range, locationIds);
    const events = eventsByOrder(db.orderStatusEvents);
    const productMap = indexById(db.products);

    // Habits need volume: a short period falls back to the 90 days ending with it.
    const heatmapExtended = live.length < 250;
    const heatmapOrders = heatmapExtended ? liveOrders(db, { from: startOfDay(subDays(range.to, 89)), to: range.to }, locationIds) : live;

    const items = itemsByOrder(db.orderItems);
    const brandCount = new Map<ID, number>();
    const catCount = new Map<ID, number>();
    let frameCount = 0;
    let itemCount = 0;
    for (const o of live) {
      for (const it of items.get(o.id) ?? []) {
        const p = productMap.get(it.productId);
        if (!p) continue;
        itemCount++;
        catCount.set(p.categoryId, (catCount.get(p.categoryId) ?? 0) + 1);
        if (p.kind === "frame") {
          frameCount++;
          brandCount.set(p.brandId, (brandCount.get(p.brandId) ?? 0) + 1);
        }
      }
    }
    const top = (m: Map<ID, number>) => [...m].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count);

    // Segments of the clients served in the period
    const stats = clientStats(db, null);
    const served = new Set(live.map((o) => o.clientId));
    const segments: Record<ClientSegment, number> = { new: 0, regular: 0, loyal: 0 };
    let returning = 0;
    for (const id of served) {
      const s = stats.get(id);
      if (!s) continue;
      segments[s.segment]++;
      if (s.globalOrderCount >= 2) returning++;
    }

    return {
      heatmap: activityHeatmap(heatmapOrders),
      heatmapExtended,
      brands: top(brandCount),
      categories: top(catCount),
      frameCount,
      itemCount,
      lead: computeLeadTimes(events, live.map((o) => o.id)),
      segments,
      served: served.size,
      returning,
    };
  });
}

export function getActionLists(db: DB, locationIds: ID[]): ActionLists {
  return cached(db, `lists|${locationIds.join()}`, () => {
    const events = eventsByOrder(db.orderStatusEvents);
    const levels = stockIndex(db.stockMovements);
    const pays = paymentsByOrder(db.payments);
    const pickup = db.orders
      .filter((o) => o.status === "in_store" && locationIds.includes(o.locationId))
      .map((o) => {
        const ev = events.get(o.id);
        return { order: o, reste: orderReste(o, pays.get(o.id) ?? []), since: ev?.[ev.length - 1]?.createdAt ?? o.createdAt };
      })
      .filter((x) => x.reste > 0)
      .sort((a, b) => a.since.localeCompare(b.since));
    const noCosts = db.orders
      .filter((o) => !o.costsCompleted && o.status !== "cancelled" && locationIds.includes(o.locationId))
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    const lowStock = db.stockThresholds
      .filter((th) => locationIds.includes(th.locationId))
      .map((th) => ({ productId: th.productId, locationId: th.locationId, qty: levels.get(stockKey(th.productId, th.locationId)) ?? 0, min: th.minQty }))
      .filter((x) => {
        const s = stockState(x.qty, x.min);
        return s === "out" || s === "low";
      })
      .sort((a, b) => a.qty / Math.max(1, a.min) - b.qty / Math.max(1, b.min));
    return { pickup, noCosts, lowStock };
  });
}
