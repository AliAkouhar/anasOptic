import type { ID, PurchaseOrder, PurchaseOrderItem, StockMovement, Supplier } from "@/lib/types";
import { commit, getDb, updateById, type UndoHandle } from "../store";
import { RepoError, newId, nowIso, requireAuth, requirePermission, resolveLowStock, settle } from "./base";

export interface PurchaseOrderInput {
  supplierId: ID;
  locationId: ID;
  items: PurchaseOrderItem[];
}

function validateItems(items: PurchaseOrderItem[]) {
  if (items.length === 0) throw new RepoError("empty_items");
  for (const it of items) {
    if (!(it.qty > 0) || !Number.isInteger(it.qty) || !(it.unitCost >= 0)) throw new RepoError("invalid_amount");
  }
}

function nextReference(orders: PurchaseOrder[], year: number) {
  const prefix = `BC-${year}-`;
  const max = orders
    .filter((po) => po.reference.startsWith(prefix))
    .reduce((m, po) => Math.max(m, Number(po.reference.slice(prefix.length)) || 0), 0);
  return `${prefix}${String(max + 1).padStart(3, "0")}`;
}

function loadPo(id: ID) {
  const db = getDb();
  const auth = requireAuth(db);
  requirePermission(auth, "purchases.manage");
  const po = db.purchaseOrders.find((p) => p.id === id);
  if (!po) throw new RepoError("not_found");
  return { db, auth, po };
}

export const purchasesRepo = {
  async create(input: PurchaseOrderInput & { status: "draft" | "ordered" }): Promise<{ po: PurchaseOrder }> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "purchases.manage");
    validateItems(input.items);
    const createdAt = nowIso();
    const po: PurchaseOrder = {
      id: newId("po"),
      reference: nextReference(db.purchaseOrders, new Date().getFullYear()),
      supplierId: input.supplierId,
      locationId: input.locationId,
      status: input.status,
      items: input.items,
      createdAt,
      orderedAt: input.status === "ordered" ? createdAt : undefined,
    };
    commit((d) => ({ purchaseOrders: [...d.purchaseOrders, po] }));
    return settle({ po });
  },

  async update(id: ID, input: PurchaseOrderInput): Promise<{ undo: UndoHandle["undo"] }> {
    const { po } = loadPo(id);
    if (po.status !== "draft") throw new RepoError("po_not_editable");
    validateItems(input.items);
    const handle = commit((d) => ({ purchaseOrders: updateById(d.purchaseOrders, id, input) }));
    return settle({ undo: handle.undo });
  },

  async markOrdered(id: ID): Promise<{ undo: UndoHandle["undo"] }> {
    const { po } = loadPo(id);
    if (po.status !== "draft") throw new RepoError("po_not_editable");
    const handle = commit((d) => ({ purchaseOrders: updateById(d.purchaseOrders, id, { status: "ordered", orderedAt: nowIso() }) }));
    return settle({ undo: handle.undo });
  },

  /** Rule 9: receiving creates `purchase` movements (+) at the PO's location. */
  async markReceived(id: ID): Promise<{ undo: UndoHandle["undo"]; received: number }> {
    const { auth, po } = loadPo(id);
    if (po.status === "received") throw new RepoError("po_not_editable");
    const createdAt = nowIso();
    const movements: StockMovement[] = po.items.map((it) => ({
      id: newId("mv"),
      productId: it.productId,
      locationId: po.locationId,
      qty: it.qty,
      reason: "purchase",
      refId: po.id,
      userId: auth.user.id,
      createdAt,
    }));
    const handle = commit((d) => {
      const next = { ...d, stockMovements: [...d.stockMovements, ...movements] };
      return {
        stockMovements: next.stockMovements,
        purchaseOrders: updateById(d.purchaseOrders, id, { status: "received", receivedAt: createdAt, orderedAt: po.orderedAt ?? createdAt }),
        notifications: resolveLowStock(next),
      };
    });
    return settle({ undo: handle.undo, received: po.items.reduce((s, it) => s + it.qty, 0) });
  },

  async remove(id: ID): Promise<void> {
    const { po } = loadPo(id);
    if (po.status !== "draft") throw new RepoError("po_not_editable");
    commit((d) => ({ purchaseOrders: d.purchaseOrders.filter((p) => p.id !== id) }));
    return settle(undefined);
  },

  async saveSupplier(input: Omit<Supplier, "id"> & { id?: ID }): Promise<{ supplier: Supplier }> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "purchases.manage");
    if (!input.name.trim()) throw new RepoError("name_required");
    const supplier: Supplier = { id: input.id ?? newId("sup"), name: input.name.trim(), phone: input.phone.trim(), categoryId: input.categoryId };
    commit((d) => ({
      suppliers: input.id ? updateById(d.suppliers, input.id, supplier) : [...d.suppliers, supplier],
    }));
    return settle({ supplier });
  },

  async removeSupplier(id: ID): Promise<void> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "purchases.manage");
    if (db.purchaseOrders.some((po) => po.supplierId === id)) throw new RepoError("supplier_in_use");
    commit((d) => ({ suppliers: d.suppliers.filter((s) => s.id !== id) }));
    return settle(undefined);
  },
};
