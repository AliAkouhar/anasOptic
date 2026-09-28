"use client";

import {
  Boxes,
  Factory,
  LayoutDashboard,
  ListOrdered,
  type LucideIcon,
  Plus,
  ReceiptText,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import { useMemo } from "react";
import { create } from "zustand";
import { can, type NavKey } from "@/lib/permissions";
import { useAuth, useOrderScope } from "@/data/hooks";
import { useDb } from "@/data/store";

export const NAV_ICONS: Record<NavKey, LucideIcon> = {
  dashboard: LayoutDashboard,
  newOrder: Plus,
  orders: ListOrdered,
  workshop: Factory,
  clients: Users,
  stock: Boxes,
  purchases: ShoppingCart,
  charges: ReceiptText,
  settings: Settings,
};

export function isNavActive(pathname: string, href: string): boolean {
  if (href === "/orders") return pathname === "/orders" || (/^\/orders\/[^/]+$/.test(pathname) && pathname !== "/orders/new");
  return pathname === href || pathname.startsWith(href + "/");
}

/** Small counters next to nav items: workshop queue, orders missing costs. */
/** A plain count over the orders in scope (no joins: this runs on every page). */
export function useNavBadges(): Partial<Record<NavKey, number>> {
  const auth = useAuth();
  const scope = useOrderScope();
  const orders = useDb((db) => db.orders);
  return useMemo(() => {
    const badges: Partial<Record<NavKey, number>> = {};
    const inScope = (locationId: string) => scope !== "none" && (scope === null || scope.includes(locationId));
    let workshop = 0;
    let missingCosts = 0;
    for (const o of orders) {
      if (!inScope(o.locationId)) continue;
      if (o.status === "confirmed" || o.status === "workshop" || o.status === "prepared") workshop++;
      if (!o.costsCompleted && o.status !== "cancelled") missingCosts++;
    }
    if (can(auth, "workshop.view")) badges.workshop = workshop;
    if (can(auth, "charges.view")) badges.charges = missingCosts;
    return badges;
  }, [auth, scope, orders]);
}

interface PaletteStore {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const usePalette = create<PaletteStore>((set) => ({ open: false, setOpen: (open) => set({ open }) }));
