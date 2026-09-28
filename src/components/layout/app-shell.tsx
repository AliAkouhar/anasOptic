"use client";

import { ShieldX } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/data/hooks";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { canAccessRoute, homePath, type AuthUser } from "@/lib/permissions";
import { cn } from "@/lib/utils";
import { CommandPalette } from "./command-palette";
import { MobileNav } from "./mobile-nav";
import { Sidebar } from "./sidebar";
import { Topbar } from "./topbar";

export function Unauthorized({ auth }: { auth: AuthUser }) {
  const t = useTranslations("unauthorized");
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-destructive/10 text-destructive">
        <ShieldX className="size-8" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <Button asChild size="lg">
        <Link href={homePath(auth)}>{t("cta")}</Link>
      </Button>
    </div>
  );
}

/**
 * Signed-in layout: sidebar (desktop), topbar, bottom nav (phones), command palette.
 * Routes the user's role cannot open render a friendly "Accès non autorisé" page instead.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useTranslations("nav");
  const auth = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const signedIn = !!auth && auth.user.isActive;

  useEffect(() => {
    if (!signedIn) router.replace("/login");
  }, [signedIn, router]);

  if (!signedIn) return null;
  const allowed = canAccessRoute(auth, pathname);
  // The order wizard has its own sticky action bar on phones.
  const focusMode = pathname === "/orders/new";

  return (
    <div className="flex min-h-dvh">
      <a
        href="#main"
        className="sr-only z-50 rounded-lg bg-primary px-4 py-2 text-primary-foreground focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t("skipToContent")}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar />
        <main id="main" tabIndex={-1} className={cn("mx-auto w-full max-w-[1440px] flex-1 px-4 pt-5 outline-none sm:px-6 md:pt-7 md:pb-12 lg:px-8", focusMode ? "pb-40" : "pb-28")}>
          {allowed ? children : <Unauthorized auth={auth} />}
        </main>
      </div>
      {!focusMode && <MobileNav />}
      <CommandPalette />
    </div>
  );
}
