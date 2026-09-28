/**
 * Shared plumbing for repositories. Repositories are the only layer allowed to write to the
 * store; each public function mirrors a future Supabase RPC / trigger and enforces the same
 * permission + location rules RLS will.
 */

import { stockKey } from "@/lib/calculations";
import { can, resolveAuthUser, type AuthUser, type PermissionKey } from "@/lib/permissions";
import type { DB, ID, Notification, NotificationType } from "@/lib/types";
import { WRITE_LATENCY_MS } from "../constants";
import { stockIndex, thresholdIndex } from "../indexes";
import { getDb, useSession } from "../store";

export type RepoErrorCode =
  | "unauthenticated"
  | "forbidden"
  | "not_found"
  | "invalid_transition"
  | "reste_not_zero"
  | "invalid_amount"
  | "deposit_exceeds_total"
  | "amount_exceeds_reste"
  | "out_of_stock"
  | "insufficient_stock"
  | "same_location"
  | "duplicate_phone"
  | "invalid_phone"
  | "name_required"
  | "email_taken"
  | "option_in_use"
  | "role_in_use"
  | "last_admin"
  | "self_deactivation"
  | "lens_source_missing"
  | "no_cost_lines"
  | "supplier_in_use"
  | "po_not_editable"
  | "negative_stock"
  | "empty_items";

export class RepoError extends Error {
  constructor(
    public readonly code: RepoErrorCode,
    public readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = "RepoError";
  }
}

export function isRepoError(e: unknown): e is RepoError {
  return e instanceof RepoError;
}

export function currentAuth(db: DB = getDb()): AuthUser | null {
  const userId = useSession.getState().userId;
  return resolveAuthUser(db.users.find((u) => u.id === userId), db.roles);
}

export function requireAuth(db: DB = getDb()): AuthUser {
  const auth = currentAuth(db);
  if (!auth || !auth.user.isActive) throw new RepoError("unauthenticated");
  return auth;
}

export function requirePermission(auth: AuthUser, ...anyOf: PermissionKey[]) {
  if (!anyOf.some((k) => can(auth, k))) throw new RepoError("forbidden", { permission: anyOf[0] });
}

export function newId(prefix: string): ID {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}_${rand}`;
}

export const nowIso = () => new Date().toISOString();

/** Simulated round-trip: the store is already updated (optimistic UI), we only wait a little. */
export function settle<T>(value: T, ms = WRITE_LATENCY_MS): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), ms));
}

// ─── Notifications ───────────────────────────────────────────────────────────

/** Active users whose role grants `permission` (and optionally who work at `locationId`). */
export function recipients(db: DB, permission: PermissionKey, locationId?: ID): ID[] {
  return db.users
    .filter((u) => {
      if (!u.isActive) return false;
      const auth = resolveAuthUser(u, db.roles);
      if (!can(auth, permission)) return false;
      return locationId === undefined || u.locationId === locationId;
    })
    .map((u) => u.id);
}

export function makeNotifications(userIds: ID[], type: NotificationType, refId: ID, locationId?: ID): Notification[] {
  const createdAt = nowIso();
  return userIds.map((userId) => ({ id: newId("n"), userId, type, refId, locationId, read: false, createdAt }));
}

/**
 * After stock movements: a `low_stock` notification for every touched product/location now under
 * its threshold, without duplicating an unread one.
 */
export function lowStockNotifications(db: DB, pairs: { productId: ID; locationId: ID }[]): Notification[] {
  const levels = stockIndex(db.stockMovements);
  const thresholds = thresholdIndex(db.stockThresholds);
  const admins = recipients(db, "stock.view_all");
  const created: Notification[] = [];
  const done = new Set<string>();
  for (const { productId, locationId } of pairs) {
    const k = stockKey(productId, locationId);
    if (done.has(k)) continue;
    done.add(k);
    const min = thresholds.get(k);
    if (min === undefined || (levels.get(k) ?? 0) >= min) continue;
    for (const userId of admins) {
      const duplicate = db.notifications.some(
        (n) => n.type === "low_stock" && !n.read && n.userId === userId && n.refId === productId && n.locationId === locationId,
      );
      if (!duplicate) created.push(...makeNotifications([userId], "low_stock", productId, locationId));
    }
  }
  return created;
}

/** Marks low-stock alerts as read once the level is back at or above the threshold. */
export function resolveLowStock(db: DB): DB["notifications"] {
  const levels = stockIndex(db.stockMovements);
  const thresholds = thresholdIndex(db.stockThresholds);
  let changed = false;
  const next = db.notifications.map((n) => {
    if (n.type !== "low_stock" || n.read || !n.locationId) return n;
    const k = stockKey(n.refId, n.locationId);
    const min = thresholds.get(k);
    if (min !== undefined && (levels.get(k) ?? 0) >= min) {
      changed = true;
      return { ...n, read: true };
    }
    return n;
  });
  return changed ? next : db.notifications;
}
