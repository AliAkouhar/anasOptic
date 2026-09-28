import { canTransition, nextInvoiceNumber, orderReste, round2, stockKey, sumAmounts } from "@/lib/calculations";
import { isValidMoroccanMobile, normalizePhone } from "@/lib/format";
import { canViewOrder, creatableLocations, statusPermission } from "@/lib/permissions";
import {
  SUPPLIER_SOURCE,
  type Client,
  type EyePrescription,
  type FlowStatus,
  type ID,
  type Order,
  type OrderCost,
  type OrderItem,
  type OrderStatusEvent,
  type Payment,
  type StockMovement,
} from "@/lib/types";
import { indexById, paymentsByOrder, stockIndex } from "../indexes";
import { commit, getDb, updateById, type UndoHandle } from "../store";
import {
  RepoError,
  lowStockNotifications,
  makeNotifications,
  newId,
  nowIso,
  recipients,
  requireAuth,
  requirePermission,
  resolveLowStock,
  settle,
} from "./base";

export type NewClientInput = { fullName: string; phone: string; isWhatsapp: boolean };

export interface NewOrderInput {
  locationId: ID;
  client: { id: ID } | NewClientInput;
  od: EyePrescription;
  og: EyePrescription;
  customValues: Record<ID, unknown>;
  frameProductId?: ID;
  frameDescription?: string;
  lensProductId?: ID;
  lensQty?: number;
  lensTypeId?: ID;
  lensTreatmentIds: ID[];
  lensDescription?: string;
  total: number;
  deposit: number;
  paymentMethodId: ID;
}

export interface CostLineInput {
  id?: ID;
  label: string;
  amount: number;
}

export interface SaveCostsInput {
  lines: CostLineInput[];
  /** orderItemId → location id or SUPPLIER_SOURCE */
  lensSources: Record<ID, ID>;
  /** Lets the admin add the lens when the order was created without one. */
  addLens?: { productId: ID; qty: number; source: ID };
}

function loadOrder(orderId: ID) {
  const db = getDb();
  const auth = requireAuth(db);
  const order = db.orders.find((o) => o.id === orderId);
  if (!order) throw new RepoError("not_found");
  if (!canViewOrder(auth, order)) throw new RepoError("forbidden");
  return { db, auth, order };
}

function statusEvent(order: Order, to: Order["status"], userId: ID, createdAt = nowIso()): OrderStatusEvent {
  return { id: newId("ev"), orderId: order.id, from: order.status, to, userId, createdAt };
}

export const ordersRepo = {
  /**
   * Rule 1: an order is created `confirmed`, with its deposit, in one transaction:
   * invoice number per location, frame stock out, status event, "costs needed" notification.
   */
  async create(input: NewOrderInput): Promise<{ order: Order; client: Client }> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "orders.create");
    if (!creatableLocations(auth, db.locations).some((l) => l.id === input.locationId)) throw new RepoError("forbidden");
    if (!(input.total > 0)) throw new RepoError("invalid_amount");
    if (input.deposit < 0) throw new RepoError("invalid_amount");
    if (input.deposit > input.total) throw new RepoError("deposit_exceeds_total");

    const createdAt = nowIso();
    let client: Client;
    let clients = db.clients;
    if ("id" in input.client) {
      const existing = db.clients.find((c) => c.id === (input.client as { id: ID }).id);
      if (!existing) throw new RepoError("not_found");
      client = existing;
    } else {
      const fullName = input.client.fullName.trim();
      const phone = normalizePhone(input.client.phone);
      if (!fullName) throw new RepoError("name_required");
      if (!isValidMoroccanMobile(phone)) throw new RepoError("invalid_phone");
      const duplicate = db.clients.find((c) => normalizePhone(c.phone) === phone);
      if (duplicate) throw new RepoError("duplicate_phone", { clientId: duplicate.id, name: duplicate.fullName });
      client = { id: newId("c"), fullName, phone, isWhatsapp: input.client.isWhatsapp, locationId: input.locationId, createdAt };
      clients = [...db.clients, client];
    }

    if (input.frameProductId) {
      const level = stockIndex(db.stockMovements).get(stockKey(input.frameProductId, input.locationId)) ?? 0;
      if (level < 1) throw new RepoError("out_of_stock", { productId: input.frameProductId });
    }

    const order: Order = {
      id: newId("o"),
      locationId: input.locationId,
      invoiceNumber: nextInvoiceNumber(db.orders, input.locationId),
      clientId: client.id,
      status: "confirmed",
      total: round2(input.total),
      od: input.od,
      og: input.og,
      lensTypeId: input.lensTypeId,
      lensTreatmentIds: input.lensTreatmentIds,
      lensDescription: input.lensDescription?.trim() || undefined,
      frameDescription: input.frameDescription?.trim() || undefined,
      customValues: input.customValues,
      createdBy: auth.user.id,
      createdAt,
      costsCompleted: false,
    };
    const items: OrderItem[] = [];
    const movements: StockMovement[] = [];
    if (input.frameProductId) {
      items.push({ id: newId("oi"), orderId: order.id, productId: input.frameProductId, qty: 1, sourceLocationId: input.locationId });
      movements.push({
        id: newId("mv"),
        productId: input.frameProductId,
        locationId: input.locationId,
        qty: -1,
        reason: "order",
        refId: order.id,
        userId: auth.user.id,
        createdAt,
      });
    }
    if (input.lensProductId) {
      items.push({ id: newId("oi"), orderId: order.id, productId: input.lensProductId, qty: input.lensQty ?? 2 });
    }
    const payments: Payment[] =
      input.deposit > 0
        ? [{ id: newId("pay"), orderId: order.id, amount: round2(input.deposit), methodId: input.paymentMethodId, kind: "deposit", userId: auth.user.id, createdAt }]
        : [];
    const event: OrderStatusEvent = { id: newId("ev"), orderId: order.id, to: "confirmed", userId: auth.user.id, createdAt };

    commit((d) => {
      const stockMovements = [...d.stockMovements, ...movements];
      const low = lowStockNotifications({ ...d, stockMovements }, movements);
      return {
        clients,
        orders: [...d.orders, order],
        orderItems: [...d.orderItems, ...items],
        payments: [...d.payments, ...payments],
        orderStatusEvents: [...d.orderStatusEvents, event],
        stockMovements,
        notifications: [
          ...d.notifications,
          ...makeNotifications(recipients(d, "orders.edit_costs"), "order_costs_needed", order.id, order.locationId),
          ...low,
        ],
      };
    });
    return settle({ order, client });
  },

  /** Rule 2: forward by one step only; rule 4: delivered requires reste = 0. */
  async setStatus(orderId: ID, to: FlowStatus): Promise<{ order: Order; undo: UndoHandle["undo"] }> {
    const { db, auth, order } = loadOrder(orderId);
    requirePermission(auth, statusPermission(to));
    if (!canTransition(order.status, to)) throw new RepoError("invalid_transition", { from: order.status, to });
    if (to === "delivered") {
      const reste = orderReste(order, paymentsByOrder(db.payments).get(order.id) ?? []);
      if (reste > 0) throw new RepoError("reste_not_zero", { reste });
    }
    const updated: Order = { ...order, status: to };
    const handle = commit((d) => ({
      orders: updateById(d.orders, orderId, { status: to }),
      orderStatusEvents: [...d.orderStatusEvents, statusEvent(order, to, auth.user.id)],
      notifications:
        to === "in_store"
          ? [...d.notifications, ...makeNotifications(recipients(d, "orders.view_own_location", order.locationId), "order_in_store", order.id, order.locationId)]
          : to === "delivered"
            ? d.notifications.map((n) => (n.refId === order.id && n.type === "order_in_store" && !n.read ? { ...n, read: true } : n))
            : d.notifications,
    }));
    return settle({ order: updated, undo: handle.undo });
  },

  /** Adds a payment (never more than the reste). */
  async addPayment(orderId: ID, input: { amount: number; methodId: ID }): Promise<{ payment: Payment; undo: UndoHandle["undo"] }> {
    const { db, auth, order } = loadOrder(orderId);
    requirePermission(auth, "orders.create", "orders.set_status.delivered");
    if (order.status === "cancelled") throw new RepoError("invalid_transition");
    const reste = orderReste(order, paymentsByOrder(db.payments).get(order.id) ?? []);
    const amount = round2(input.amount);
    if (!(amount > 0)) throw new RepoError("invalid_amount");
    if (amount > reste) throw new RepoError("amount_exceeds_reste", { reste });
    const payment: Payment = {
      id: newId("pay"),
      orderId,
      amount,
      methodId: input.methodId,
      kind: order.status === "delivered" || order.status === "in_store" ? "balance" : "deposit",
      userId: auth.user.id,
      createdAt: nowIso(),
    };
    const handle = commit((d) => ({ payments: [...d.payments, payment] }));
    return settle({ payment, undo: handle.undo });
  },

  /** "Encaisser le reste" then deliver, in one transaction. */
  async collectAndDeliver(orderId: ID, input: { amount: number; methodId: ID }): Promise<{ order: Order; undo: UndoHandle["undo"] }> {
    const { db, auth, order } = loadOrder(orderId);
    requirePermission(auth, "orders.set_status.delivered");
    if (!canTransition(order.status, "delivered")) throw new RepoError("invalid_transition", { from: order.status, to: "delivered" });
    const reste = orderReste(order, paymentsByOrder(db.payments).get(order.id) ?? []);
    const amount = round2(input.amount);
    if (amount > reste) throw new RepoError("amount_exceeds_reste", { reste });
    if (amount < reste) throw new RepoError("reste_not_zero", { reste: round2(reste - amount) });
    const createdAt = nowIso();
    const payments: Payment[] =
      amount > 0 ? [{ id: newId("pay"), orderId, amount, methodId: input.methodId, kind: "balance", userId: auth.user.id, createdAt }] : [];
    const handle = commit((d) => ({
      payments: [...d.payments, ...payments],
      orders: updateById(d.orders, orderId, { status: "delivered" }),
      orderStatusEvents: [...d.orderStatusEvents, statusEvent(order, "delivered", auth.user.id, createdAt)],
      notifications: d.notifications.map((n) =>
        n.refId === order.id && n.type === "order_in_store" && !n.read ? { ...n, read: true } : n,
      ),
    }));
    return settle({ order: { ...order, status: "delivered" }, undo: handle.undo });
  },

  /**
   * Rule 6: reverse every stock movement of the order, refund the deposits, status `cancelled`.
   * Cancelled orders then drop out of every revenue KPI.
   */
  async cancel(orderId: ID): Promise<{ order: Order; refunded: number; restocked: number }> {
    const { db, auth, order } = loadOrder(orderId);
    requirePermission(auth, "orders.cancel");
    if (!canTransition(order.status, "cancelled")) throw new RepoError("invalid_transition", { from: order.status, to: "cancelled" });
    const createdAt = nowIso();

    // Net quantity taken per product/location by this order.
    const taken = new Map<string, { productId: ID; locationId: ID; qty: number }>();
    for (const m of db.stockMovements) {
      if (m.refId !== orderId || (m.reason !== "order" && m.reason !== "order_cancel")) continue;
      const k = stockKey(m.productId, m.locationId);
      const t = taken.get(k) ?? { productId: m.productId, locationId: m.locationId, qty: 0 };
      t.qty += m.qty;
      taken.set(k, t);
    }
    const reversals: StockMovement[] = [...taken.values()]
      .filter((t) => t.qty < 0)
      .map((t) => ({
        id: newId("mv"),
        productId: t.productId,
        locationId: t.locationId,
        qty: -t.qty,
        reason: "order_cancel",
        refId: orderId,
        userId: auth.user.id,
        createdAt,
      }));

    const orderPayments = paymentsByOrder(db.payments).get(orderId) ?? [];
    const paid = sumAmounts(orderPayments);
    const refund: Payment[] =
      paid > 0
        ? [{
            id: newId("pay"),
            orderId,
            amount: -paid,
            methodId: orderPayments.find((p) => p.amount > 0)?.methodId ?? db.options.find((o) => o.listKey === "payment_method")!.id,
            kind: "refund",
            userId: auth.user.id,
            createdAt,
          }]
        : [];

    commit((d) => {
      const next = { ...d, stockMovements: [...d.stockMovements, ...reversals] };
      return {
        stockMovements: next.stockMovements,
        payments: [...d.payments, ...refund],
        orders: updateById(d.orders, orderId, { status: "cancelled" }),
        orderStatusEvents: [...d.orderStatusEvents, statusEvent(order, "cancelled", auth.user.id, createdAt)],
        notifications: resolveLowStock({
          ...next,
          notifications: d.notifications.map((n) => (n.refId === orderId && !n.read ? { ...n, read: true } : n)),
        }),
      };
    });
    return settle({
      order: { ...order, status: "cancelled" },
      refunded: paid,
      restocked: reversals.reduce((s, m) => s + m.qty, 0),
    });
  },

  /**
   * Rule 7 (admin): cost lines + the source of each lens. Lens stock is taken from the chosen
   * location (not for "Fournisseur direct"); changing the source later moves the stock back.
   */
  async saveCosts(orderId: ID, input: SaveCostsInput): Promise<{ undo: UndoHandle["undo"] }> {
    const { db, auth, order } = loadOrder(orderId);
    requirePermission(auth, "orders.edit_costs");
    if (order.status === "cancelled") throw new RepoError("invalid_transition");
    const lines = input.lines.filter((l) => l.label.trim() || l.amount);
    if (lines.length === 0) throw new RepoError("no_cost_lines");
    if (lines.some((l) => !l.label.trim() || !(l.amount >= 0))) throw new RepoError("invalid_amount");

    const createdAt = nowIso();
    const products = indexById(db.products);
    let orderItems = db.orderItems;
    const lensSources = { ...input.lensSources };
    if (input.addLens) {
      const item: OrderItem = { id: newId("oi"), orderId, productId: input.addLens.productId, qty: input.addLens.qty };
      orderItems = [...orderItems, item];
      lensSources[item.id] = input.addLens.source;
    }
    const lensItems = orderItems.filter((i) => i.orderId === orderId && products.get(i.productId)?.kind === "lens");

    const levels = new Map(stockIndex(db.stockMovements));
    const movements: StockMovement[] = [];
    const move = (productId: ID, locationId: ID, qty: number, note?: string) => {
      movements.push({ id: newId("mv"), productId, locationId, qty, reason: "order", refId: orderId, userId: auth.user.id, createdAt, note });
      const k = stockKey(productId, locationId);
      levels.set(k, (levels.get(k) ?? 0) + qty);
    };
    const newSources = new Map<ID, ID>();
    for (const item of lensItems) {
      const source = lensSources[item.id] ?? item.sourceLocationId;
      if (!source) throw new RepoError("lens_source_missing", { itemId: item.id });
      if (source === item.sourceLocationId) continue;
      if (item.sourceLocationId && item.sourceLocationId !== SUPPLIER_SOURCE) {
        move(item.productId, item.sourceLocationId, item.qty, "Changement de provenance");
      }
      if (source !== SUPPLIER_SOURCE) {
        const available = levels.get(stockKey(item.productId, source)) ?? 0;
        if (available < item.qty) {
          throw new RepoError("insufficient_stock", { productId: item.productId, locationId: source, available, requested: item.qty });
        }
        move(item.productId, source, -item.qty);
      }
      newSources.set(item.id, source);
    }

    const existing = new Map(db.orderCosts.filter((c) => c.orderId === orderId).map((c) => [c.id, c]));
    const costRows: OrderCost[] = lines.map((l) => {
      const prev = l.id ? existing.get(l.id) : undefined;
      return prev
        ? { ...prev, label: l.label.trim(), amount: round2(l.amount) }
        : { id: newId("oc"), orderId, label: l.label.trim(), amount: round2(l.amount), createdAt };
    });

    const handle = commit((d) => {
      const stockMovements = movements.length ? [...d.stockMovements, ...movements] : d.stockMovements;
      const next = { ...d, stockMovements };
      const low = lowStockNotifications(next, movements.filter((m) => m.qty < 0));
      return {
        orderItems: orderItems.map((i) => (newSources.has(i.id) ? { ...i, sourceLocationId: newSources.get(i.id) } : i)),
        orderCosts: [...d.orderCosts.filter((c) => c.orderId !== orderId), ...costRows],
        orders: updateById(d.orders, orderId, { costsCompleted: true }),
        stockMovements,
        notifications: [
          ...d.notifications.map((n) => (n.refId === orderId && n.type === "order_costs_needed" && !n.read ? { ...n, read: true } : n)),
          ...low,
        ],
      };
    });
    return settle({ undo: handle.undo });
  },
};
