"use client";

import { PanelLeftClose, PanelLeftOpen, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { BrandName, LogoMark } from "@/components/brand/logo";
import { useRequiredAuth } from "@/data/hooks";
import { useDb, useSession } from "@/data/store";
import { Link, usePathname } from "@/i18n/navigation";
import { can, homePath, visibleNav } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { NAV_ICONS, isNavActive, useNavBadges } from "./nav-config";

export function Sidebar() {
  const t = useTranslations("nav");
  const auth = useRequiredAuth();
  const pathname = usePathname();
  const collapsed = useSession((s) => s.sidebarCollapsed);
  const toggle = useSession((s) => s.toggleSidebar);
  const appName = useDb((db) => db.settings.appName);
  const badges = useNavBadges();
  const items = visibleNav(auth).filter((i) => i.key !== "newOrder");
  // Labels show on large screens unless collapsed; tablets always get the icon rail.
  const label = collapsed ? "sr-only" : "sr-only lg:not-sr-only";
  const tip = collapsed ? "" : "lg:hidden";

  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-dvh shrink-0 flex-col border-r bg-sidebar transition-[width] duration-200 md:flex",
        collapsed ? "w-[76px]" : "w-[76px] lg:w-64",
      )}
      aria-label={t("mainNav")}
    >
      <Link
        href={homePath(auth)}
        className={cn("flex h-16 items-center gap-3 px-5", !collapsed && "lg:px-5")}
      >
        <LogoMark />
        <BrandName name={appName} className={cn("truncate text-sm", label)} />
      </Link>

      {can(auth, "orders.create") && (
        <div className="px-3 pb-3">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button asChild size="lg" className="w-full justify-center gap-2 px-0 shadow-soft lg:px-4">
                <Link href="/orders/new" aria-label={t("newOrder")}>
                  <Plus className="size-5" />
                  <span className={label}>{t("newOrder")}</span>
                </Link>
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right" className={tip}>
              {t("newOrder")}
            </TooltipContent>
          </Tooltip>
        </div>
      )}

      <nav className="flex-1 overflow-y-auto px-3 py-2">
        <ul className="space-y-1">
          {items.map((item) => {
            const Icon = NAV_ICONS[item.key];
            const active = isNavActive(pathname, item.href);
            const badge = badges[item.key];
            return (
              <li key={item.key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Link
                      href={item.href}
                      aria-current={active ? "page" : undefined}
                      className={cn(
                        "group relative flex h-11 items-center gap-3 rounded-xl px-3.5 text-sm font-medium text-sidebar-foreground/80 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                        active && "bg-sidebar-accent text-sidebar-accent-foreground",
                      )}
                    >
                      {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" aria-hidden="true" />}
                      <Icon className="size-5 shrink-0" aria-hidden="true" />
                      <span className={cn("flex-1 truncate", label)}>{t(item.key)}</span>
                      {badge ? (
                        <span
                          className={cn(
                            "num min-w-5 rounded-full bg-attention-strong px-1.5 text-center text-[11px] leading-5 font-semibold text-attention-strong-foreground",
                            collapsed ? "absolute top-1 right-1" : "absolute top-1 right-1 lg:static",
                          )}
                        >
                          {badge > 99 ? "99+" : badge}
                        </span>
                      ) : null}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="right" className={tip}>
                    {t(item.key)}
                  </TooltipContent>
                </Tooltip>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="hidden border-t p-3 lg:block">
        <Button
          variant="ghost"
          size="sm"
          onClick={toggle}
          className="w-full justify-start gap-3 text-muted-foreground"
          aria-label={collapsed ? t("expand") : t("collapse")}
        >
          {collapsed ? <PanelLeftOpen className="mx-auto" /> : <PanelLeftClose />}
          {!collapsed && <span>{t("collapse")}</span>}
        </Button>
      </div>
    </aside>
  );
}
