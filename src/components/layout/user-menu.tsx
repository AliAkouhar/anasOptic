"use client";

import { Languages, LogOut, Monitor, Moon, RotateCcw, Sun } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useTheme } from "next-themes";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { useLabels, useRequiredAuth } from "@/data/hooks";
import { demoRepo } from "@/data/repositories";
import { useSession } from "@/data/store";
import { usePathname, useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { initials } from "@/lib/format";

export function useResetDemo() {
  const t = useTranslations("shell");
  const feedback = useFeedback();
  return async () => {
    await demoRepo.reset();
    feedback.success(t("resetDemoDone"));
  };
}

export function useSwitchLocale() {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  return (locale: AppLocale) => {
    const qs = search.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { locale, scroll: false });
  };
}

export function UserMenu() {
  const t = useTranslations("shell");
  const auth = useRequiredAuth();
  const labels = useLabels();
  const locale = useLocale();
  const switchLocale = useSwitchLocale();
  const { theme, setTheme } = useTheme();
  const router = useRouter();
  const resetDemo = useResetDemo();
  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label={t("userMenu")}>
            <Avatar className="size-9">
              <AvatarFallback className="bg-primary text-sm font-semibold text-primary-foreground">{initials(auth.user.fullName)}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-72 rounded-xl">
          <DropdownMenuLabel className="space-y-0.5 py-2">
            <p className="truncate font-semibold">{auth.user.fullName}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">{auth.user.email}</p>
            <p className="truncate text-xs font-normal text-muted-foreground">
              {labels.localized(auth.role)} · {auth.user.locationId ? labels.location(auth.user.locationId) : t("noLocation")}
            </p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Languages className="size-4" />
              {t("language")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={locale} onValueChange={(v) => switchLocale(v as AppLocale)}>
                <DropdownMenuRadioItem value="fr">Français</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="en">English</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              {theme === "dark" ? <Moon className="size-4" /> : theme === "system" ? <Monitor className="size-4" /> : <Sun className="size-4" />}
              {t("theme")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="light">{t("themeLight")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">{t("themeDark")}</DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="system">{t("themeSystem")}</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirmReset(true)} className="gap-2">
            <RotateCcw className="size-4" />
            {t("resetDemo")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              useSession.getState().signOut();
              router.replace("/login");
            }}
            className="gap-2"
          >
            <LogOut className="size-4" />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title={t("resetDemoTitle")}
        description={t("resetDemoBody")}
        confirmLabel={t("resetDemoConfirm")}
        onConfirm={resetDemo}
      />
    </>
  );
}
