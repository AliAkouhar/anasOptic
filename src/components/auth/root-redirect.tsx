"use client";

import { Compass } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/data/hooks";
import { Link, useRouter } from "@/i18n/navigation";
import { homePath } from "@/lib/permissions";

/** "/" → the user's home page, or the login page. */
export function RootRedirect() {
  const auth = useAuth();
  const router = useRouter();
  useEffect(() => {
    router.replace(auth?.user.isActive ? homePath(auth) : "/login");
  }, [auth, router]);
  return null;
}

export function NotFoundView() {
  const t = useTranslations("notFound");
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="grid size-16 place-items-center rounded-2xl bg-accent text-primary">
        <Compass className="size-8" aria-hidden="true" />
      </span>
      <h1 className="text-2xl font-semibold">{t("title")}</h1>
      <p className="text-muted-foreground">{t("body")}</p>
      <Button asChild size="lg">
        <Link href="/">{t("cta")}</Link>
      </Button>
    </div>
  );
}
