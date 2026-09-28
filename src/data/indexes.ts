/**
 * Memoised lookups over the mock tables. Each index is cached per table *reference*: tables are
 * replaced immutably on write, so an index is rebuilt once per change, not once per render.
 * (With Supabase these become SQL views / joins.)
 */

import { buildStockIndex, clientSegment, orderReste, stockKey, sumAmounts } from "@/lib/calculations";
import type {
  Client,
  ClientSegment,
  CustomField,
  DB,
  ID,
  Location,
  Option,
  Order,
  OrderCost,
  OrderItem,
  OrderStatusEvent,
  Payment,
  Product,
  StockMovement,
  StockThreshold,
} from "@/lib/types";
import type { Lang } from "@/lib/format";

function weakMemo<A extends object, R>(fn: (a: A) => R): (a: A) => R {
  const cache = new WeakMap<A, R>();
  return (a) => {
    if (cache.has(a)) return cache.get(a) as R;
    const r = fn(a);
    cache.set(a, r);
    return r;
  };
}

/** Single-slot memo on several references (all callers share the same current tables). */
function refMemo<Args extends readonly unknown[], R>(fn: (...args: Args) => R): (...args: Args) => R {
  let lastArgs: Args | null = null;
  let last: R;
  return (...args) => {
    if (lastArgs && lastArgs.length === args.length && lastArgs.every((a, i) => a === args[i])) return last;
    last = fn(...args);
    lastArgs = args;
    return last;
  };
}

function groupBy<T>(rows: readonly T[], key: (r: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const r of rows) {
    const k = key(r);
    const list = map.get(k);
    if (list) list.push(r);
    else map.set(k, [r]);
  }
  return map;
}

const idIndexCache = new WeakMap<object, Map<string, unknown>>();
export function indexById<T extends { id: ID }>(rows: readonly T[]): Map<ID, T> {
  let map = idIndexCache.get(rows) as Map<ID, T> | undefined;
  if (!map) {
    map = new Map(rows.map((r) => [r.id, r]));
    idIndexCache.set(rows, map);
  }
  return map;
}

export const paymentsByOrder = weakMemo((rows: Payment[]) => groupBy(rows, (p) => p.orderId));
export const itemsByOrder = weakMemo((rows: OrderItem[]) => groupBy(rows, (i) => i.orderId));
export const costsByOrder = weakMemo((rows: OrderCost[]) => groupBy(rows, (c) => c.orderId));
export const ordersByClient = weakMemo((rows: Order[]) => groupBy(rows, (o) => o.clientId));
export const eventsByOrder = weakMemo((rows: OrderStatusEvent[]) => {
  const map = groupBy(rows, (e) => e.orderId);
  for (const list of map.values()) list.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return map;
});
export const movementsByProduct = weakMemo((rows: StockMovement[]) => groupBy(rows, (m) => m.productId));
export const stockIndex = weakMemo((rows: StockMovement[]) => buildStockIndex(rows));
export const thresholdIndex = weakMemo(
  (rows: StockThreshold[]) => new Map(rows.map((t) => [stockKey(t.productId, t.locationId), t.minQty])),
);

// ─── Labels ──────────────────────────────────────────────────────────────────

export function optionLabel(option: Option | undefined, lang: Lang): string {
  if (!option) return "—";
  return lang === "en" ? option.labelEn || option.labelFr : option.labelFr || option.labelEn;
}

export function localized(item: { labelFr: string; labelEn: string } | undefined, lang: Lang): string {
  if (!item) return "—";
  return lang === "en" ? item.labelEn || item.labelFr : item.labelFr || item.labelEn;
}

export function customFieldOptions(field: CustomField, lang: Lang): string[] {
  return (lang === "en" ? field.optionsEn : field.optionsFr) ?? field.optionsFr ?? [];
}

/** "Rayban RB2140 Wayfarer": the brand label is resolved from its option, so a rename shows everywhere. */
export function productLabel(product: Product | undefined, options: Option[], lang: Lang): string {
  if (!product) return "—";
  const brand = indexById(options).get(product.brandId);
  return brand ? `${optionLabel(brand, lang)} ${product.name}` : product.name;
}

export function sortedOptions(options: Option[], listKey: Option["listKey"], includeArchived = false): Option[] {
  return options
    .filter((o) => o.listKey === listKey && (includeArchived || o.isActive))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

// ─── Order views ─────────────────────────────────────────────────────────────

export interface OrderView {
  order: Order;
  client: Client | undefined;
  location: Location | undefined;
  paid: number;
  reste: number;
  /** When the order entered its current status. */
  statusSince: string;
}

export const buildOrderViews = refMemo(
  (orders: Order[], payments: Payment[], events: OrderStatusEvent[], clients: Client[], locations: Location[]): OrderView[] => {
    const pays = paymentsByOrder(payments);
    const evs = eventsByOrder(events);
    const clientMap = indexById(clients);
    const locationMap = indexById(locations);
    return orders.map((order) => {
      const p = pays.get(order.id) ?? [];
      const e = evs.get(order.id);
      return {
        order,
        client: clientMap.get(order.clientId),
        location: locationMap.get(order.locationId),
        paid: sumAmounts(p),
        reste: orderReste(order, p),
        statusSince: e?.[e.length - 1]?.createdAt ?? order.createdAt,
      };
    });
  },
);

export function orderViews(db: DB): OrderView[] {
  return buildOrderViews(db.orders, db.payments, db.orderStatusEvents, db.clients, db.locations);
}

// ─── Client stats ────────────────────────────────────────────────────────────

export interface ClientStats {
  /** Non-cancelled orders across every shop (drives the segment). */
  globalOrderCount: number;
  segment: ClientSegment;
  /** Within the caller's scope: */
  orderCount: number;
  totalSpent: number;
  lastVisit: string | null;
  firstVisit: string | null;
}

const clientStatsCache = new WeakMap<Order[], Map<string, Map<ID, ClientStats>>>();

export function clientStats(db: DB, scope: ID[] | null): Map<ID, ClientStats> {
  const scopeKey = `${scope ? scope.join(",") : "*"}|${db.loyalty.regularMinOrders}|${db.loyalty.loyalMinOrders}`;
  let perScope = clientStatsCache.get(db.orders);
  if (!perScope) {
    perScope = new Map();
    clientStatsCache.set(db.orders, perScope);
  }
  const cached = perScope.get(scopeKey);
  if (cached) return cached;
  const stats = new Map<ID, ClientStats>();
  for (const c of db.clients) {
    stats.set(c.id, { globalOrderCount: 0, segment: "new", orderCount: 0, totalSpent: 0, lastVisit: null, firstVisit: null });
  }
  for (const o of db.orders) {
    const s = stats.get(o.clientId);
    if (!s || o.status === "cancelled") continue;
    s.globalOrderCount++;
    if (scope && !scope.includes(o.locationId)) continue;
    s.orderCount++;
    s.totalSpent += o.total;
    if (!s.lastVisit || o.createdAt > s.lastVisit) s.lastVisit = o.createdAt;
    if (!s.firstVisit || o.createdAt < s.firstVisit) s.firstVisit = o.createdAt;
  }
  for (const s of stats.values()) s.segment = clientSegment(s.globalOrderCount, db.loyalty);
  perScope.set(scopeKey, stats);
  return stats;
}

/** Clients a scoped user may see: registered at, or ordered at, one of their locations. */
export function visibleClientIds(db: DB, scope: ID[] | null): Set<ID> | null {
  if (!scope) return null;
  const ids = new Set<ID>();
  for (const c of db.clients) if (scope.includes(c.locationId)) ids.add(c.id);
  for (const o of db.orders) if (scope.includes(o.locationId)) ids.add(o.clientId);
  return ids;
}

// ─── Option usage (settings: "utilisé dans 128 commandes") ───────────────────

export interface OptionUsage {
  orders: number;
  products: number;
  payments: number;
  suppliers: number;
}

export const optionUsage = refMemo(
  (
    orders: Order[],
    orderItems: OrderItem[],
    products: Product[],
    payments: Payment[],
    suppliers: DB["suppliers"],
  ): Map<ID, OptionUsage> => {
    const usage = new Map<ID, OptionUsage>();
    const bump = (id: ID | undefined, k: keyof OptionUsage) => {
      if (!id) return;
      const u = usage.get(id) ?? { orders: 0, products: 0, payments: 0, suppliers: 0 };
      u[k]++;
      usage.set(id, u);
    };
    const productMap = indexById(products);
    for (const p of products) {
      bump(p.brandId, "products");
      bump(p.categoryId, "products");
      bump(p.lensTypeId, "products");
      bump(p.materialId, "products");
    }
    const items = itemsByOrder(orderItems);
    for (const o of orders) {
      const seen = new Set<ID>();
      if (o.lensTypeId) seen.add(o.lensTypeId);
      for (const t of o.lensTreatmentIds) seen.add(t);
      for (const it of items.get(o.id) ?? []) {
        const p = productMap.get(it.productId);
        if (!p) continue;
        seen.add(p.brandId);
        seen.add(p.categoryId);
        if (p.materialId) seen.add(p.materialId);
      }
      for (const id of seen) bump(id, "orders");
    }
    for (const p of payments) bump(p.methodId, "payments");
    for (const s of suppliers) bump(s.categoryId, "suppliers");
    return usage;
  },
);

export function getOptionUsage(db: DB): Map<ID, OptionUsage> {
  return optionUsage(db.orders, db.orderItems, db.products, db.payments, db.suppliers);
}

export function totalUsage(u: OptionUsage | undefined): number {
  return u ? u.orders + u.products + u.payments + u.suppliers : 0;
}
