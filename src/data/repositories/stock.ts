import { stockKey } from "@/lib/calculations";
import { can } from "@/lib/permissions";
import type { ID, StockMovement, Transfer } from "@/lib/types";
import { stockIndex } from "../indexes";
import { commit, getDb, type UndoHandle } from "../store";
import { RepoError, lowStockNotifications, newId, nowIso, requireAuth, requirePermission, resolveLowStock, settle } from "./base";

export interface TransferInput {
  fromLocationId: ID;
  toLocationId: ID;
  items: { productId: ID; qty: number }[];
  note?: string;
}

export const stockRepo = {
  /**
   * Rule 8: one action = `transfer_out` (−) at the source + `transfer_in` (+) at the destination.
   * All or nothing: blocked if the source lacks stock for any line.
   */
  async transfer(input: TransferInput): Promise<{ transfer: Transfer; undo: UndoHandle["undo"] }> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "stock.transfer");
    if (input.fromLocationId === input.toLocationId) throw new RepoError("same_location");
    const lines = new Map<ID, number>();
    for (const it of input.items) {
      if (!(it.qty > 0) || !Number.isInteger(it.qty)) throw new RepoError("invalid_amount", { productId: it.productId });
      lines.set(it.productId, (lines.get(it.productId) ?? 0) + it.qty);
    }
    if (lines.size === 0) throw new RepoError("empty_items");
    const levels = stockIndex(db.stockMovements);
    const shortages = [...lines]
      .map(([productId, qty]) => ({ productId, requested: qty, available: levels.get(stockKey(productId, input.fromLocationId)) ?? 0 }))
      .filter((s) => s.available < s.requested);
    if (shortages.length) throw new RepoError("insufficient_stock", { shortages });

    const createdAt = nowIso();
    const transfer: Transfer = {
      id: newId("tr"),
      fromLocationId: input.fromLocationId,
      toLocationId: input.toLocationId,
      items: [...lines].map(([productId, qty]) => ({ productId, qty })),
      userId: auth.user.id,
      createdAt,
      note: input.note?.trim() || undefined,
    };
    const movements: StockMovement[] = transfer.items.flatMap(({ productId, qty }) => [
      { id: newId("mv"), productId, locationId: input.fromLocationId, qty: -qty, reason: "transfer_out" as const, refId: transfer.id, userId: auth.user.id, createdAt },
      { id: newId("mv"), productId, locationId: input.toLocationId, qty, reason: "transfer_in" as const, refId: transfer.id, userId: auth.user.id, createdAt },
    ]);
    const handle = commit((d) => {
      const next = { ...d, stockMovements: [...d.stockMovements, ...movements] };
      return {
        transfers: [...d.transfers, transfer],
        stockMovements: next.stockMovements,
        notifications: [...resolveLowStock(next), ...lowStockNotifications(next, movements.filter((m) => m.qty < 0))],
      };
    });
    return settle({ transfer, undo: handle.undo });
  },

  /** Manual correction (breakage, inventory count…). A reason is mandatory. */
  async adjust(input: { productId: ID; locationId: ID; delta: number; note: string }): Promise<{ undo: UndoHandle["undo"] }> {
    const db = getDb();
    const auth = requireAuth(db);
    requirePermission(auth, "stock.adjust");
    if (!Number.isInteger(input.delta) || input.delta === 0) throw new RepoError("invalid_amount");
    if (!input.note.trim()) throw new RepoError("name_required");
    const level = stockIndex(db.stockMovements).get(stockKey(input.productId, input.locationId)) ?? 0;
    if (level + input.delta < 0) throw new RepoError("negative_stock", { available: level });
    const movement: StockMovement = {
      id: newId("mv"),
      productId: input.productId,
      locationId: input.locationId,
      qty: input.delta,
      reason: "adjustment",
      userId: auth.user.id,
      createdAt: nowIso(),
      note: input.note.trim(),
    };
    const handle = commit((d) => {
      const next = { ...d, stockMovements: [...d.stockMovements, movement] };
      return {
        stockMovements: next.stockMovements,
        notifications: [...resolveLowStock(next), ...lowStockNotifications(next, movement.qty < 0 ? [movement] : [])],
      };
    });
    return settle({ undo: handle.undo });
  },

  async setThreshold(productId: ID, locationId: ID, minQty: number): Promise<{ undo: UndoHandle["undo"] }> {
    const db = getDb();
    const auth = requireAuth(db);
    if (!can(auth, "stock.adjust")) throw new RepoError("forbidden");
    if (!Number.isInteger(minQty) || minQty < 0) throw new RepoError("invalid_amount");
    const handle = commit((d) => {
      const exists = d.stockThresholds.some((t) => t.productId === productId && t.locationId === locationId);
      const stockThresholds = exists
        ? d.stockThresholds.map((t) => (t.productId === productId && t.locationId === locationId ? { ...t, minQty } : t))
        : [...d.stockThresholds, { productId, locationId, minQty }];
      const next = { ...d, stockThresholds };
      return {
        stockThresholds,
        notifications: [...resolveLowStock(next), ...lowStockNotifications(next, [{ productId, locationId }])],
      };
    });
    return settle({ undo: handle.undo });
  },
};
