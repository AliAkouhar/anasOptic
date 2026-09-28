import type { FlowStatus, ID, Location, Order, Role, User } from "./types";

/**
 * Permission keys. Roles are data (a list of these keys), not code.
 * In Supabase these become the `role_permissions` table and are checked by RLS policies.
 */
export const PERMISSIONS = [
  "dashboard.view",
  "orders.create",
  "orders.view_all",
  "orders.view_own_location",
  "orders.cancel",
  "orders.set_status.confirmed",
  "orders.set_status.workshop",
  "orders.set_status.prepared",
  "orders.set_status.in_store",
  "orders.set_status.delivered",
  "orders.view_costs",
  "orders.edit_costs",
  "workshop.view",
  "clients.manage",
  "stock.view_all",
  "stock.view_own_location",
  "stock.transfer",
  "stock.adjust",
  "purchases.manage",
  "charges.view",
  "charges.manage",
  "settings.manage",
  "users.manage",
  "roles.manage",
] as const;

export type PermissionKey = (typeof PERMISSIONS)[number];

export const PERMISSION_GROUPS = [
  { id: "dashboard", permissions: ["dashboard.view"] },
  {
    id: "orders",
    permissions: [
      "orders.create",
      "orders.view_all",
      "orders.view_own_location",
      "orders.cancel",
    ],
  },
  {
    id: "status",
    permissions: [
      "orders.set_status.confirmed",
      "orders.set_status.workshop",
      "orders.set_status.prepared",
      "orders.set_status.in_store",
      "orders.set_status.delivered",
    ],
  },
  { id: "workshop", permissions: ["workshop.view"] },
  { id: "finance", permissions: ["orders.view_costs", "orders.edit_costs", "charges.view", "charges.manage"] },
  { id: "clients", permissions: ["clients.manage"] },
  {
    id: "stock",
    permissions: ["stock.view_all", "stock.view_own_location", "stock.transfer", "stock.adjust", "purchases.manage"],
  },
  { id: "admin", permissions: ["settings.manage", "users.manage", "roles.manage"] },
] as const satisfies readonly { id: string; permissions: readonly PermissionKey[] }[];

export const SECRETARY_PERMISSIONS: PermissionKey[] = [
  "orders.create",
  "orders.view_own_location",
  "orders.set_status.confirmed",
  "orders.set_status.workshop",
  "orders.set_status.prepared",
  "orders.set_status.in_store",
  "orders.set_status.delivered",
  "clients.manage",
  "stock.view_own_location",
];

/** The signed-in user with their resolved role. */
export interface AuthUser {
  user: User;
  role: Role;
  permissions: ReadonlySet<PermissionKey>;
}

export function resolveAuthUser(user: User | undefined, roles: Role[]): AuthUser | null {
  if (!user) return null;
  const role = roles.find((r) => r.id === user.roleId);
  if (!role) return null;
  return { user, role, permissions: new Set(role.permissions) };
}

export function can(auth: AuthUser | null | undefined, key: PermissionKey): boolean {
  return !!auth && auth.user.isActive && auth.permissions.has(key);
}

export function canAny(auth: AuthUser | null | undefined, keys: readonly PermissionKey[]): boolean {
  return keys.some((k) => can(auth, k));
}

export function statusPermission(status: FlowStatus): PermissionKey {
  return `orders.set_status.${status}`;
}

// ─── Location scoping (mirrors the future RLS policies) ─────────────────────

/**
 * Locations whose orders the user may see. `null` means every location.
 * `activeLocationId` is the topbar selector ("all" or one location) and only narrows the admin's view.
 */
export function orderScope(auth: AuthUser | null, activeLocationId: ID | "all"): ID[] | null | "none" {
  if (!auth) return "none";
  if (can(auth, "orders.view_all")) return activeLocationId === "all" ? null : [activeLocationId];
  if (can(auth, "orders.view_own_location") && auth.user.locationId) return [auth.user.locationId];
  return "none";
}

export function stockScope(auth: AuthUser | null): ID[] | null | "none" {
  if (!auth) return "none";
  if (can(auth, "stock.view_all")) return null;
  if (can(auth, "stock.view_own_location") && auth.user.locationId) return [auth.user.locationId];
  return "none";
}

export function inScope(scope: ID[] | null | "none", locationId: ID): boolean {
  if (scope === "none") return false;
  return scope === null || scope.includes(locationId);
}

/** Order detail visibility: own scope, or the workshop queue (the atelier works for every shop). */
export function canViewOrder(auth: AuthUser | null, order: Order): boolean {
  if (!auth) return false;
  if (can(auth, "orders.view_all")) return true;
  if (can(auth, "orders.view_own_location") && auth.user.locationId === order.locationId) return true;
  return can(auth, "workshop.view");
}

/** Locations the user can create orders for. */
export function creatableLocations(auth: AuthUser | null, locations: Location[]): Location[] {
  if (!can(auth, "orders.create")) return [];
  const stores = locations.filter((l) => l.type === "store" && l.isActive);
  if (can(auth, "orders.view_all")) return stores;
  return stores.filter((l) => l.id === auth?.user.locationId);
}

// ─── Routes ──────────────────────────────────────────────────────────────────

const ROUTE_RULES: { test: (path: string) => boolean; anyOf: PermissionKey[] }[] = [
  { test: (p) => p.startsWith("/dashboard"), anyOf: ["dashboard.view"] },
  { test: (p) => p === "/orders/new", anyOf: ["orders.create"] },
  {
    test: (p) => /^\/orders\/[^/]+$/.test(p),
    anyOf: ["orders.view_all", "orders.view_own_location", "workshop.view"],
  },
  { test: (p) => p.startsWith("/orders"), anyOf: ["orders.view_all", "orders.view_own_location"] },
  { test: (p) => p.startsWith("/workshop"), anyOf: ["workshop.view"] },
  { test: (p) => p.startsWith("/clients"), anyOf: ["clients.manage"] },
  { test: (p) => p.startsWith("/stock/transfers"), anyOf: ["stock.transfer"] },
  { test: (p) => p.startsWith("/stock"), anyOf: ["stock.view_all", "stock.view_own_location"] },
  { test: (p) => p.startsWith("/purchases"), anyOf: ["purchases.manage"] },
  { test: (p) => p.startsWith("/charges"), anyOf: ["charges.view"] },
  { test: (p) => p.startsWith("/settings"), anyOf: ["settings.manage", "users.manage", "roles.manage"] },
];

/** `path` is locale-less, e.g. "/orders/o_12". */
export function canAccessRoute(auth: AuthUser | null, path: string): boolean {
  if (!auth) return false;
  const rule = ROUTE_RULES.find((r) => r.test(path));
  return rule ? canAny(auth, rule.anyOf) : true;
}

export type NavKey =
  | "dashboard"
  | "newOrder"
  | "orders"
  | "workshop"
  | "clients"
  | "stock"
  | "purchases"
  | "charges"
  | "settings";

export const NAV_ITEMS: { key: NavKey; href: string }[] = [
  { key: "dashboard", href: "/dashboard" },
  { key: "newOrder", href: "/orders/new" },
  { key: "orders", href: "/orders" },
  { key: "workshop", href: "/workshop" },
  { key: "clients", href: "/clients" },
  { key: "stock", href: "/stock" },
  { key: "purchases", href: "/purchases" },
  { key: "charges", href: "/charges" },
  { key: "settings", href: "/settings" },
];

export function visibleNav(auth: AuthUser | null) {
  return NAV_ITEMS.filter((item) => canAccessRoute(auth, item.href));
}

/** Where a user lands after login or a role switch. */
export function homePath(auth: AuthUser | null): string {
  if (can(auth, "dashboard.view")) return "/dashboard";
  if (canAny(auth, ["orders.view_all", "orders.view_own_location"])) return "/orders";
  if (can(auth, "workshop.view")) return "/workshop";
  const first = visibleNav(auth)[0];
  return first ? first.href : "/notifications";
}
