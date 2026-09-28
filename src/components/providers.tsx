"use client";

import { ThemeProvider } from "next-themes";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { LogoMark } from "@/components/brand/logo";
import { bootDatabase, useDbStore, useSession } from "@/data/store";
import { useIsMobile } from "@/hooks/use-media-query";

function Splash() {
  const t = useTranslations("shell");
  return (
    <div className="fixed inset-0 grid place-items-center bg-background" role="status" aria-live="polite">
      <div className="flex flex-col items-center gap-4">
        <LogoMark className="size-14 motion-safe:animate-pulse" />
        <p className="text-sm text-muted-foreground">{t("splash")}</p>
      </div>
    </div>
  );
}

/** Loads the persisted mock database and session before rendering anything that reads them. */
function DataGate({ children }: { children: ReactNode }) {
  const ready = useDbStore((s) => s.ready);
  const sessionReady = useSession((s) => s.hydrated);
  useEffect(() => {
    void useSession.persist.rehydrate();
    void bootDatabase();
  }, []);
  if (!ready || !sessionReady) return <Splash />;
  return <>{children}</>;
}

function ResponsiveToaster() {
  const isMobile = useIsMobile();
  return <Toaster position={isMobile ? "top-center" : "bottom-right"} closeButton richColors={false} visibleToasts={4} />;
}

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem disableTransitionOnChange>
      <TooltipProvider delayDuration={250}>
        <DataGate>{children}</DataGate>
        <ResponsiveToaster />
      </TooltipProvider>
    </ThemeProvider>
  );
}
