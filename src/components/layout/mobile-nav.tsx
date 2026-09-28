"use client";

import { Bell, Menu, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useRequiredAuth } from "@/data/hooks";
import { Link, usePathname } from "@/i18n/navigation";
import { can, visibleNav } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { LocationSelector } from "./location-selector";
import { NAV_ICONS, isNavActive, useNavBadges } from "./nav-config";

const SLOT = "flex h-16 flex-1 flex-col items-center justify-center gap-1 text-[11px] font-medium";

/** Phones: 4–5 main items with a raised "+ Nouvelle commande" button in the middle. */
export function MobileNav() {
  const t = useTranslations("nav");
  const auth = useRequiredAuth();
  const pathname = usePathname();
  const badges = useNavBadges();
  const [moreOpen, setMoreOpen] = useState(false);
  const items = visibleNav(auth).filter((i) => i.key !== "newOrder");
  const canCreate = can(auth, "orders.create");
  const overflow = items.length > 4;
  const primary = overflow ? items.slice(0, 3) : items;
  const left = primary.slice(0, 2);
  const right = primary.slice(2);

  const renderItem = (item: (typeof items)[number]) => {
    const Icon = NAV_ICONS[item.key];
    const active = isNavActive(pathname, item.href);
    const badge = badges[item.key];
    return (
      <Link
        key={item.key}
        href={item.href}
        aria-current={active ? "page" : undefined}
        className={cn(SLOT, "relative text-muted-foreground transition-colors", active && "text-primary")}
      >
        <span className={cn("relative grid h-8 w-14 place-items-center rounded-full transition-colors", active && "bg-accent")}>
          <Icon className="size-5" aria-hidden="true" />
          {badge ? (
            <span className="num absolute -top-1 right-1 min-w-4 rounded-full bg-attention-strong px-1 text-center text-[10px] leading-4 font-bold text-attention-strong-foreground">
              {badge > 99 ? "99+" : badge}
            </span>
          ) : null}
        </span>
        <span className="max-w-full truncate px-1">{t(item.key)}</span>
      </Link>
    );
  };

  return (
    <>
      <nav
        aria-label={t("mainNav")}
        className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80 md:hidden"
      >
        <div className="mx-auto flex max-w-lg items-stretch">
          {left.map(renderItem)}
          {canCreate && (
            <div className={SLOT}>
              <Link
                href="/orders/new"
                aria-label={t("newOrder")}
                className="-mt-7 grid size-14 place-items-center rounded-full bg-primary text-primary-foreground shadow-lift ring-4 ring-background transition-transform active:scale-95"
              >
                <Plus className="size-7" aria-hidden="true" />
              </Link>
              <span className="text-primary">{t("newOrder").split(" ")[0]}</span>
            </div>
          )}
          {right.map(renderItem)}
          {overflow ? (
            <button type="button" onClick={() => setMoreOpen(true)} className={cn(SLOT, "text-muted-foreground")}>
              <span className="grid h-8 w-14 place-items-center rounded-full">
                <Menu className="size-5" aria-hidden="true" />
              </span>
              {t("more")}
            </button>
          ) : (
            <Link href="/notifications" className={cn(SLOT, "text-muted-foreground", pathname === "/notifications" && "text-primary")}>
              <span className="grid h-8 w-14 place-items-center rounded-full">
                <Bell className="size-5" aria-hidden="true" />
              </span>
              {t("notifications")}
            </Link>
          )}
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[85dvh] rounded-t-3xl pb-safe" closeLabel={t("menu")}>
          <SheetHeader className="pb-0">
            <SheetTitle>{t("menu")}</SheetTitle>
            <SheetDescription className="sr-only">{t("mainNav")}</SheetDescription>
          </SheetHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-6">
            <LocationSelector className="w-full sm:w-full" />
            <div className="grid grid-cols-3 gap-2">
              {[...items, { key: "notifications" as const, href: "/notifications" }].map((item) => {
                const Icon = item.key === "notifications" ? Bell : NAV_ICONS[item.key];
                const active = isNavActive(pathname, item.href);
                return (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={() => setMoreOpen(false)}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border bg-card px-2 py-4 text-center text-xs font-medium",
                      active && "border-primary bg-accent text-accent-foreground",
                    )}
                  >
                    <Icon className="size-6" aria-hidden="true" />
                    {t(item.key)}
                  </Link>
                );
              })}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
