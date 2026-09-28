/**
 * ALL business math lives here as pure functions (no store, no React).
 * They are unit-tested in calculations.test.ts and will map to SQL views /
 * Postgres functions when the backend moves to Supabase.
 */

import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfDay,
  endOfMonth,
  getDaysInMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
  subMonths,
  subYears,
} from "date-fns";
import type {
  ClientSegment,
  FixedCharge,
  FlowStatus,
  ID,
  LoyaltySettings,
  Order,
  OrderCost,
  OrderStatus,
  OrderStatusEvent,
  Payment,
  StockMovement,
} from "./types";
import { STATUS_FLOW } from "./types";

export const round2 = (n: number) => Math.round(n * 100) / 100;

export function sumAmounts(items: readonly { amount: number }[]): number {
  let s = 0;
  for (const i of items) s += i.amount;
  return round2(s);
}

// ─── Payments ────────────────────────────────────────────────────────────────

/** reste = total − SUM(payments). Always computed, never stored. */
export function computeReste(total: number, payments: readonly Pick<Payment, "amount">[]): number {
  return round2(total - sumAmounts(payments));
}

/** A cancelled order owes nothing (its deposits were refunded). */
export function orderReste(
  order: Pick<Order, "total" | "status">,
  payments: readonly Pick<Payment, "amount">[],
): number {
  if (order.status === "cancelled") return 0;
  return computeReste(order.total, payments);
}

// ─── Invoice numbering ───────────────────────────────────────────────────────

/** Sequential PER location: max(invoiceNumber of that location) + 1. */
export function nextInvoiceNumber(
  orders: readonly Pick<Order, "locationId" | "invoiceNumber">[],
  locationId: ID,
): number {
  let max = 0;
  for (const o of orders) if (o.locationId === locationId && o.invoiceNumber > max) max = o.invoiceNumber;
  return max + 1;
}

// ─── Stock ───────────────────────────────────────────────────────────────────

export const stockKey = (productId: ID, locationId: ID) => `${productId}|${locationId}`;

/** Stock level = SUM(movements.qty) per product/location. */
export function buildStockIndex(movements: readonly StockMovement[]): Map<string, number> {
  const index = new Map<string, number>();
  for (const m of movements) {
    const k = stockKey(m.productId, m.locationId);
    index.set(k, (index.get(k) ?? 0) + m.qty);
  }
  return index;
}

export function stockLevel(movements: readonly StockMovement[], productId: ID, locationId: ID): number {
  let qty = 0;
  for (const m of movements) if (m.productId === productId && m.locationId === locationId) qty += m.qty;
  return qty;
}

export type StockState = "out" | "low" | "near" | "ok";

/** Red below the threshold, amber when at the threshold or one above it. */
export function stockState(qty: number, minQty: number): StockState {
  if (qty <= 0) return "out";
  if (qty < minQty) return "low";
  if (qty <= minQty + 1) return "near";
  return "ok";
}

// ─── Clients ─────────────────────────────────────────────────────────────────

/** From the count of non-cancelled orders. */
export function clientSegment(orderCount: number, loyalty: LoyaltySettings): ClientSegment {
  if (orderCount >= loyalty.loyalMinOrders) return "loyal";
  if (orderCount >= loyalty.regularMinOrders) return "regular";
  return "new";
}

// ─── Status flow ─────────────────────────────────────────────────────────────

export function nextStatus(status: OrderStatus): FlowStatus | null {
  if (status === "cancelled" || status === "delivered") return null;
  const i = STATUS_FLOW.indexOf(status);
  return STATUS_FLOW[i + 1] ?? null;
}

/** Only forward by one step, or `cancelled` from any status before `delivered`. */
export function canTransition(from: OrderStatus, to: OrderStatus): boolean {
  if (to === "cancelled") return from !== "delivered" && from !== "cancelled";
  return nextStatus(from) === to;
}

// ─── Periods & comparisons ───────────────────────────────────────────────────

export interface DateRange {
  from: Date;
  to: Date;
}

export type Comparison = "none" | "mom" | "yoy";

export function normalizeRange(range: DateRange): DateRange {
  return { from: startOfDay(range.from), to: endOfDay(range.to) };
}

/** M-1 shifts both ends by one month, A-1 by one year (same days, previous period). */
export function shiftRange(range: DateRange, comparison: Comparison): DateRange | null {
  if (comparison === "none") return null;
  const shift = comparison === "mom" ? (d: Date) => subMonths(d, 1) : (d: Date) => subYears(d, 1);
  // A full month compares with the full previous month (30 Sept → 31 Aug, not 30 Aug).
  const fullMonth =
    range.from.getTime() === startOfMonth(range.from).getTime() &&
    startOfDay(range.to).getTime() === startOfDay(endOfMonth(range.from)).getTime();
  const from = shift(range.from);
  const to = fullMonth ? endOfMonth(from) : shift(range.to);
  return normalizeRange({ from, to });
}

/** Relative change. null when there is nothing to compare with. */
export function percentDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / Math.abs(previous);
}

export function inRange(iso: string, range: DateRange): boolean {
  const t = Date.parse(iso);
  return t >= range.from.getTime() && t <= range.to.getTime();
}

// ─── Revenue, costs & margins ────────────────────────────────────────────────

/** Fixed charges are monthly; a partial period gets a prorated share (by days). */
export function fixedChargesForRange(
  charges: readonly FixedCharge[],
  range: DateRange,
  locationIds: readonly ID[] | null,
): number {
  const r = normalizeRange(range);
  let total = 0;
  for (const c of charges) {
    if (locationIds && !locationIds.includes(c.locationId)) continue;
    const [y, m] = c.month.split("-").map(Number);
    const monthStart = new Date(y, m - 1, 1);
    const monthEnd = endOfMonth(monthStart);
    if (monthEnd < r.from || monthStart > r.to) continue;
    const overlapStart = monthStart > r.from ? monthStart : r.from;
    const overlapEnd = monthEnd < r.to ? monthEnd : r.to;
    const days = differenceInCalendarDays(overlapEnd, overlapStart) + 1;
    total += (c.amount * days) / getDaysInMonth(monthStart);
  }
  return round2(total);
}

export interface Margins {
  revenue: number;
  orderCosts: number;
  fixedCharges: number;
  grossMargin: number;
  netMargin: number;
  grossRate: number | null;
  netRate: number | null;
}

/** grossMargin = revenue − orderCosts; netMargin = grossMargin − fixedCharges. */
export function computeMargins(revenue: number, orderCosts: number, fixedCharges: number): Margins {
  const grossMargin = round2(revenue - orderCosts);
  const netMargin = round2(grossMargin - fixedCharges);
  return {
    revenue: round2(revenue),
    orderCosts: round2(orderCosts),
    fixedCharges: round2(fixedCharges),
    grossMargin,
    netMargin,
    grossRate: revenue ? grossMargin / revenue : null,
    netRate: revenue ? netMargin / revenue : null,
  };
}

export interface KpiInput {
  orders: readonly Order[];
  paymentsByOrder: ReadonlyMap<ID, readonly Payment[]>;
  costsByOrder: ReadonlyMap<ID, readonly OrderCost[]>;
  fixedCharges: readonly FixedCharge[];
  range: DateRange;
  /** null = every location */
  locationIds: readonly ID[] | null;
}

export interface Kpis extends Margins {
  orderCount: number;
  cancelledCount: number;
  avgBasket: number;
  outstanding: number;
  cancellationRate: number;
  ordersWithoutCosts: number;
}

/** Cancelled orders are excluded from every revenue KPI. */
export function computeKpis(input: KpiInput): Kpis {
  const range = normalizeRange(input.range);
  let revenue = 0;
  let orderCosts = 0;
  let orderCount = 0;
  let cancelledCount = 0;
  let outstanding = 0;
  let ordersWithoutCosts = 0;
  for (const o of input.orders) {
    if (input.locationIds && !input.locationIds.includes(o.locationId)) continue;
    if (!inRange(o.createdAt, range)) continue;
    if (o.status === "cancelled") {
      cancelledCount++;
      continue;
    }
    orderCount++;
    revenue += o.total;
    outstanding += Math.max(0, orderReste(o, input.paymentsByOrder.get(o.id) ?? []));
    if (o.costsCompleted) orderCosts += sumAmounts(input.costsByOrder.get(o.id) ?? []);
    else ordersWithoutCosts++;
  }
  const fixed = fixedChargesForRange(input.fixedCharges, range, input.locationIds);
  const all = orderCount + cancelledCount;
  return {
    ...computeMargins(revenue, orderCosts, fixed),
    orderCount,
    cancelledCount,
    avgBasket: orderCount ? round2(revenue / orderCount) : 0,
    outstanding: round2(outstanding),
    cancellationRate: all ? cancelledCount / all : 0,
    ordersWithoutCosts,
  };
}

// ─── Time series ─────────────────────────────────────────────────────────────

export type Granularity = "day" | "week" | "month";

export function pickGranularity(range: DateRange): Granularity {
  const days = differenceInCalendarDays(range.to, range.from) + 1;
  if (days <= 45) return "day";
  if (days <= 150) return "week";
  return "month";
}

export function bucketStart(date: Date, g: Granularity): Date {
  if (g === "day") return startOfDay(date);
  if (g === "week") return startOfWeek(date, { weekStartsOn: 1 });
  return startOfMonth(date);
}

function nextBucket(date: Date, g: Granularity): Date {
  if (g === "day") return addDays(date, 1);
  if (g === "week") return addDays(date, 7);
  return addMonths(date, 1);
}

/** Ordered buckets covering the range, each with the summed value. */
export function bucketize<T>(
  items: readonly T[],
  range: DateRange,
  g: Granularity,
  dateOf: (item: T) => string,
  valueOf: (item: T) => number,
): { start: Date; value: number }[] {
  const r = normalizeRange(range);
  const buckets: { start: Date; value: number }[] = [];
  const index = new Map<number, number>();
  for (let d = bucketStart(r.from, g); d <= r.to; d = nextBucket(d, g)) {
    index.set(d.getTime(), buckets.length);
    buckets.push({ start: d, value: 0 });
  }
  for (const item of items) {
    const iso = dateOf(item);
    if (!inRange(iso, r)) continue;
    const i = index.get(bucketStart(new Date(iso), g).getTime());
    if (i !== undefined) buckets[i].value += valueOf(item);
  }
  return buckets;
}

// ─── Activity heatmap ────────────────────────────────────────────────────────

export const HEATMAP_HOURS = [9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20] as const;

/** rows = Monday..Sunday, columns = HEATMAP_HOURS. Counts orders created in each slot. */
export function activityHeatmap(orders: readonly Pick<Order, "createdAt">[]): number[][] {
  const grid = Array.from({ length: 7 }, () => HEATMAP_HOURS.map(() => 0));
  for (const o of orders) {
    const d = new Date(o.createdAt);
    const row = (d.getDay() + 6) % 7;
    const col = HEATMAP_HOURS.indexOf(d.getHours() as (typeof HEATMAP_HOURS)[number]);
    if (col >= 0) grid[row][col]++;
  }
  return grid;
}

/** The busiest two-hour window, e.g. { day: 5, hour: 10 } → Saturday 10h–12h. */
export function busiestSlot(grid: number[][]): { day: number; hour: number; count: number } | null {
  let best: { day: number; hour: number; count: number } | null = null;
  for (let day = 0; day < grid.length; day++) {
    for (let c = 0; c < grid[day].length - 1; c++) {
      const count = grid[day][c] + grid[day][c + 1];
      if (!best || count > best.count) best = { day, hour: HEATMAP_HOURS[c], count };
    }
  }
  return best && best.count > 0 ? best : null;
}

// ─── Workshop lead time ──────────────────────────────────────────────────────

export const LEAD_STEPS = [
  ["confirmed", "workshop"],
  ["workshop", "prepared"],
  ["prepared", "in_store"],
  ["in_store", "delivered"],
] as const satisfies readonly (readonly [FlowStatus, FlowStatus])[];

export interface LeadTimes {
  /** Average days spent in each step, in LEAD_STEPS order (null when no data). */
  perStep: (number | null)[];
  /** Average days from confirmed to in_store (workshop time). */
  toInStore: number | null;
  /** Average days from confirmed to delivered. */
  toDelivered: number | null;
}

const DAY_MS = 86_400_000;

export function computeLeadTimes(eventsByOrder: ReadonlyMap<ID, readonly OrderStatusEvent[]>, orderIds: Iterable<ID>): LeadTimes {
  const sums = LEAD_STEPS.map(() => ({ total: 0, n: 0 }));
  const inStore = { total: 0, n: 0 };
  const delivered = { total: 0, n: 0 };
  for (const id of orderIds) {
    const events = eventsByOrder.get(id);
    if (!events) continue;
    const at = new Map<OrderStatus, number>();
    for (const e of events) at.set(e.to, Date.parse(e.createdAt));
    LEAD_STEPS.forEach(([a, b], i) => {
      const ta = at.get(a);
      const tb = at.get(b);
      if (ta !== undefined && tb !== undefined) {
        sums[i].total += (tb - ta) / DAY_MS;
        sums[i].n++;
      }
    });
    const c = at.get("confirmed");
    const s = at.get("in_store");
    const d = at.get("delivered");
    if (c !== undefined && s !== undefined) {
      inStore.total += (s - c) / DAY_MS;
      inStore.n++;
    }
    if (c !== undefined && d !== undefined) {
      delivered.total += (d - c) / DAY_MS;
      delivered.n++;
    }
  }
  const avg = (x: { total: number; n: number }) => (x.n ? x.total / x.n : null);
  return { perStep: sums.map(avg), toInStore: avg(inStore), toDelivered: avg(delivered) };
}

/** Whole days an order has spent in its current status. */
export function daysInStatus(lastEventAt: string, now: Date = new Date()): number {
  return Math.max(0, differenceInCalendarDays(now, new Date(lastEventAt)));
}
