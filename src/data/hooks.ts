"use client";

/**
 * Read side of the data layer for React. Components read through these hooks (scoped by the
 * signed-in user, like RLS will do) and write through repositories.
 */

import { useLocale } from "next-intl";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  formatDate,
  formatDateTime,
  formatDelta,
  formatMoney,
  formatMoneyCompact,
  formatNumber,
  formatPercent,
  formatRelative,
  type Lang,
} from "@/lib/format";
import { can, orderScope, resolveAuthUser, stockScope, type AuthUser, type PermissionKey } from "@/lib/permissions";
import type { ID, OptionListKey } from "@/lib/types";
import { READ_LATENCY_MS } from "./constants";
import { buildOrderViews, indexById, localized, optionLabel, productLabel, sortedOptions, type OrderView } from "./indexes";
import { useDb, useSession } from "./store";

export function useLang(): Lang {
  return useLocale() as Lang;
}

export function useAuth(): AuthUser | null {
  const userId = useSession((s) => s.userId);
  const users = useDb((db) => db.users);
  const roles = useDb((db) => db.roles);
  return useMemo(() => resolveAuthUser(users.find((u) => u.id === userId), roles), [users, roles, userId]);
}

/** Inside the app shell the user is always signed in. */
export function useRequiredAuth(): AuthUser {
  const auth = useAuth();
  if (!auth) throw new Error("useRequiredAuth used outside of the signed-in shell");
  return auth;
}

export function useCan(): (key: PermissionKey) => boolean {
  const auth = useAuth();
  return useCallback((key: PermissionKey) => can(auth, key), [auth]);
}

export function useActiveLocation(): [ID | "all", (id: ID | "all") => void] {
  const active = useSession((s) => s.activeLocationId);
  const set = useSession((s) => s.setActiveLocation);
  const locations = useDb((db) => db.locations);
  // A deleted/deactivated location falls back to "all".
  const valid = active === "all" || locations.some((l) => l.id === active && l.isActive) ? active : "all";
  return [valid, set];
}

export function useOrderScope(): ID[] | null | "none" {
  const auth = useAuth();
  const [active] = useActiveLocation();
  return useMemo(() => orderScope(auth, active), [auth, active]);
}

export function useStockScope(): ID[] | null | "none" {
  const auth = useAuth();
  return useMemo(() => stockScope(auth), [auth]);
}

/** Every order the user may see (respecting the topbar location selector for admins). */
export function useScopedOrderViews(): OrderView[] {
  const scope = useOrderScope();
  const orders = useDb((db) => db.orders);
  const payments = useDb((db) => db.payments);
  const events = useDb((db) => db.orderStatusEvents);
  const clients = useDb((db) => db.clients);
  const locations = useDb((db) => db.locations);
  return useMemo(() => {
    const views = buildOrderViews(orders, payments, events, clients, locations);
    if (scope === "none") return [];
    if (scope === null) return views;
    return views.filter((v) => scope.includes(v.order.locationId));
  }, [orders, payments, events, clients, locations, scope]);
}

/** Simulates the 300 ms network round-trip on first mount so skeletons are visible. */
export function useSimulatedLoading(ms = READ_LATENCY_MS): boolean {
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => setLoading(false), ms);
    return () => clearTimeout(t);
  }, [ms]);
  return loading;
}

/** Re-renders every `intervalMs` so "3 days ago" and ageing indicators stay fresh. */
export function useNow(intervalMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), intervalMs);
    return () => clearInterval(t);
  }, [intervalMs]);
  return now;
}

export function useOptionList(listKey: OptionListKey, includeArchived = false) {
  const options = useDb((db) => db.options);
  return useMemo(() => sortedOptions(options, listKey, includeArchived), [options, listKey, includeArchived]);
}

export function useActiveLocations(type?: "store" | "lab") {
  const locations = useDb((db) => db.locations);
  return useMemo(() => locations.filter((l) => l.isActive && (!type || l.type === type)), [locations, type]);
}

/** Label resolvers bound to the current language (ids → labels, so renames show everywhere). */
export function useLabels() {
  const lang = useLang();
  const options = useDb((db) => db.options);
  const products = useDb((db) => db.products);
  const locations = useDb((db) => db.locations);
  const users = useDb((db) => db.users);
  const roles = useDb((db) => db.roles);
  return useMemo(() => {
    const optionMap = indexById(options);
    const productMap = indexById(products);
    const locationMap = indexById(locations);
    const userMap = indexById(users);
    const roleMap = indexById(roles);
    return {
      lang,
      option: (id: ID | undefined) => (id ? optionLabel(optionMap.get(id), lang) : "—"),
      product: (id: ID | undefined) => (id ? productLabel(productMap.get(id), options, lang) : "—"),
      location: (id: ID | undefined) => (id ? (locationMap.get(id)?.name ?? "—") : "—"),
      user: (id: ID | undefined) => (id ? (userMap.get(id)?.fullName ?? "—") : "—"),
      role: (id: ID | undefined) => (id ? localized(roleMap.get(id), lang) : "—"),
      localized: (item: { labelFr: string; labelEn: string } | undefined) => localized(item, lang),
    };
  }, [lang, options, products, locations, users, roles]);
}

export function useFormat() {
  const lang = useLang();
  return useMemo(
    () => ({
      lang,
      money: (n: number) => formatMoney(n, lang),
      moneyCompact: (n: number) => formatMoneyCompact(n, lang),
      number: (n: number, digits = 0) => formatNumber(n, lang, digits),
      percent: (n: number, digits = 0) => formatPercent(n, lang, digits),
      delta: (n: number, digits = 0) => formatDelta(n, lang, digits),
      date: (d: string | Date, pattern?: string) => formatDate(d, lang, pattern),
      dateTime: (d: string | Date) => formatDateTime(d, lang),
      relative: (d: string | Date) => formatRelative(d, lang),
    }),
    [lang],
  );
}
