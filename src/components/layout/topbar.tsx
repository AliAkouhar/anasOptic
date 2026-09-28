"use client";

import { Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { BrandName, LogoMark } from "@/components/brand/logo";
import { useRequiredAuth } from "@/data/hooks";
import { useDb } from "@/data/store";
import { Link } from "@/i18n/navigation";
import { homePath } from "@/lib/permissions";
import { LocationSelector } from "./location-selector";
import { usePalette } from "./nav-config";
import { NotificationBell } from "./notification-bell";
import { RoleSwitcher } from "./role-switcher";
import { UserMenu } from "./user-menu";

export function Topbar() {
  const t = useTranslations();
  const auth = useRequiredAuth();
  const appName = useDb((db) => db.settings.appName);
  const openPalette = () => usePalette.getState().setOpen(true);

  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur supports-backdrop-filter:bg-background/70">
      <div className="flex h-16 items-center gap-2 px-4 sm:px-6 lg:px-8">
        <Link href={homePath(auth)} className="flex min-w-0 items-center gap-2 md:hidden">
          <LogoMark className="size-8" />
          <BrandName name={appName} className="truncate text-xs" />
        </Link>

        <div className="hidden min-w-0 shrink-0 md:block">
          <LocationSelector className="md:w-44 lg:w-60" />
        </div>

        <button
          type="button"
          onClick={openPalette}
          className="ml-1 hidden h-10 w-full max-w-sm min-w-0 items-center gap-2 rounded-lg border bg-card px-3 text-sm text-muted-foreground transition-colors hover:border-primary/40 md:flex"
        >
          <Search className="size-4" aria-hidden="true" />
          <span className="flex-1 truncate text-left">{t("shell.search")}</span>
          <kbd className="hidden rounded-md border bg-muted px-1.5 py-0.5 font-sans text-[11px] lg:inline">{t("palette.shortcut")}</kbd>
        </button>

        <div className="ml-auto flex items-center gap-1 sm:gap-2">
          <Button variant="ghost" size="icon" className="rounded-full md:hidden" onClick={openPalette} aria-label={t("shell.searchShort")}>
            <Search className="size-5" />
          </Button>
          <div className="hidden xl:block">
            <RoleSwitcher />
          </div>
          <div className="xl:hidden">
            <RoleSwitcher compact />
          </div>
          <NotificationBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
