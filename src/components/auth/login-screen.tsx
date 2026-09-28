"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowRight, Check, Crown, Headset, Loader2 } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandName, LogoMark } from "@/components/brand/logo";
import { useSwitchLocale } from "@/components/layout/user-menu";
import { useFeedback } from "@/components/shared/feedback";
import { DEMO_ADMIN_ID, DEMO_PASSWORD, DEMO_SECRETARY_ID } from "@/data/constants";
import { useDb, useSession } from "@/data/store";
import { useRouter } from "@/i18n/navigation";
import type { AppLocale } from "@/i18n/routing";
import { homePath, resolveAuthUser } from "@/lib/permissions";
import { cn } from "@/lib/utils";

function HeroArt() {
  return (
    <svg viewBox="0 0 420 260" className="w-full max-w-md" aria-hidden="true">
      <defs>
        <linearGradient id="lens" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stopColor="white" stopOpacity=".28" />
          <stop offset="1" stopColor="white" stopOpacity=".06" />
        </linearGradient>
      </defs>
      <g fill="url(#lens)" stroke="white" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" opacity=".95">
        <rect x="46" y="92" width="136" height="104" rx="46" />
        <rect x="238" y="92" width="136" height="104" rx="46" />
      </g>
      <g fill="none" stroke="white" strokeWidth="7" strokeLinecap="round" opacity=".95">
        <path d="M182 128c18-16 38-16 56 0" />
        <path d="M46 120 14 96" />
        <path d="M374 120l32-24" />
      </g>
      <path d="M78 120c10-12 24-18 40-18" stroke="white" strokeOpacity=".7" strokeWidth="6" strokeLinecap="round" fill="none" />
      <path d="M270 120c10-12 24-18 40-18" stroke="white" strokeOpacity=".7" strokeWidth="6" strokeLinecap="round" fill="none" />
      <g>
        <rect x="248" y="18" width="150" height="52" rx="14" fill="white" />
        <circle cx="272" cy="44" r="9" fill="#E36414" />
        <rect x="290" y="33" width="80" height="8" rx="4" fill="#0F4C5C" opacity=".85" />
        <rect x="290" y="48" width="52" height="7" rx="3.5" fill="#0F4C5C" opacity=".35" />
      </g>
      <g>
        <rect x="22" y="206" width="160" height="46" rx="14" fill="white" />
        <path d="M44 236l8 8 16-18" stroke="#2A9D8F" strokeWidth="5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        <rect x="80" y="220" width="84" height="8" rx="4" fill="#0F4C5C" opacity=".85" />
        <rect x="80" y="234" width="56" height="7" rx="3.5" fill="#0F4C5C" opacity=".35" />
      </g>
    </svg>
  );
}

function LanguageToggle() {
  const locale = useLocale();
  const switchLocale = useSwitchLocale();
  return (
    <div className="inline-flex rounded-full border bg-card p-1 text-sm" role="group" aria-label="Langue / Language">
      {(["fr", "en"] as AppLocale[]).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => switchLocale(l)}
          aria-pressed={locale === l}
          className={cn(
            "h-8 rounded-full px-3 font-medium text-muted-foreground uppercase transition-colors pointer-coarse:h-10",
            locale === l && "bg-primary text-primary-foreground",
          )}
        >
          {l}
        </button>
      ))}
    </div>
  );
}

export function LoginScreen() {
  const t = useTranslations("auth");
  const router = useRouter();
  const feedback = useFeedback();
  const users = useDb((db) => db.users);
  const roles = useDb((db) => db.roles);
  const appName = useDb((db) => db.settings.appName);

  const schema = useMemo(
    () =>
      z.object({
        email: z
          .string()
          .trim()
          .min(1, { message: t("emailRequired") })
          .pipe(z.email({ message: t("emailInvalid") })),
        password: z.string().min(1, { message: t("passwordRequired") }),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({ resolver: zodResolver(schema), defaultValues: { email: "", password: "" } });

  const enter = (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    useSession.getState().signIn(userId);
    feedback.success(t("welcome", { name: user.fullName.split(" ")[0] }));
    router.replace(homePath(resolveAuthUser(user, roles)));
  };

  const onSubmit = form.handleSubmit(async ({ email, password }) => {
    await new Promise((r) => setTimeout(r, 350));
    const user = users.find((u) => u.email.toLowerCase() === email.toLowerCase());
    if (!user || password !== DEMO_PASSWORD) {
      form.setError("root", { message: t("invalidCredentials") });
      return;
    }
    if (!user.isActive) {
      form.setError("root", { message: t("accountDisabled") });
      return;
    }
    enter(user.id);
  });

  const { errors, isSubmitting } = form.formState;

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="relative hidden flex-col justify-between overflow-hidden bg-[#0f4c5c] p-12 text-white lg:flex">
        <div className="pointer-events-none absolute -top-32 -right-32 size-96 rounded-full bg-white/5" />
        <div className="pointer-events-none absolute -bottom-40 -left-24 size-[28rem] rounded-full bg-[#e36414]/15" />
        <div className="relative flex items-center gap-3">
          <svg viewBox="0 0 40 40" className="size-10" aria-hidden="true">
            <rect width="40" height="40" rx="11" fill="white" fillOpacity=".12" />
            <g fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round">
              <circle cx="13" cy="21.5" r="5.6" />
              <circle cx="27" cy="21.5" r="5.6" />
              <path d="M18.6 20.4c.9-.9 1.9-.9 2.8 0M7.4 20 5.6 15.8M32.6 20l1.8-4.2" />
            </g>
          </svg>
          <span className="font-semibold tracking-[0.18em] uppercase">{appName}</span>
        </div>
        <div className="relative space-y-8">
          <HeroArt />
          <h2 className="max-w-lg text-4xl leading-tight font-semibold text-balance">{t("heroTitle")}</h2>
          <ul className="max-w-lg space-y-3 text-white/85">
            {(["heroPoint1", "heroPoint2", "heroPoint3"] as const).map((k) => (
              <li key={k} className="flex gap-3">
                <span className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-white/15">
                  <Check className="size-3.5" aria-hidden="true" />
                </span>
                {t(k)}
              </li>
            ))}
          </ul>
        </div>
        <p className="relative text-sm text-white/80">© {new Date().getFullYear()} {appName}</p>
      </aside>

      <main className="flex flex-col px-5 py-6 sm:px-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 lg:invisible">
            <LogoMark className="size-9" />
            <BrandName name={appName} className="text-sm" />
          </div>
          <LanguageToggle />
        </div>

        <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
          <h1 className="text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>

          <form onSubmit={onSubmit} noValidate className="mt-8 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">{t("email")}</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                inputMode="email"
                placeholder="prenom.nom@anassvision.ma"
                aria-invalid={!!errors.email}
                aria-describedby={errors.email ? "email-error" : undefined}
                {...form.register("email")}
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {errors.email.message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">{t("password")}</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                aria-invalid={!!errors.password}
                aria-describedby={errors.password ? "password-error" : "password-hint"}
                {...form.register("password")}
              />
              {errors.password ? (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password.message}
                </p>
              ) : (
                <p id="password-hint" className="text-xs text-muted-foreground">
                  {t("hint")}
                </p>
              )}
            </div>
            {errors.root && (
              <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {errors.root.message}
              </p>
            )}
            <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {t("submit")}
            </Button>
          </form>

          <div className="my-7 flex items-center gap-3 text-xs text-muted-foreground uppercase">
            <span className="h-px flex-1 bg-border" />
            {t("or")}
            <span className="h-px flex-1 bg-border" />
          </div>

          <div className="grid gap-3">
            <DemoCard
              icon={<Crown className="size-5" />}
              title={t("demoAdmin")}
              role={t("demoAdminRole")}
              description={t("demoAdminDesc")}
              onClick={() => enter(DEMO_ADMIN_ID)}
              tone="primary"
            />
            <DemoCard
              icon={<Headset className="size-5" />}
              title={t("demoSecretary")}
              role={t("demoSecretaryRole")}
              description={t("demoSecretaryDesc")}
              onClick={() => enter(DEMO_SECRETARY_ID)}
              tone="attention"
            />
          </div>
        </div>
      </main>
    </div>
  );
}

function DemoCard({
  icon,
  title,
  role,
  description,
  onClick,
  tone,
}: {
  icon: React.ReactNode;
  title: string;
  role: string;
  description: string;
  onClick: () => void;
  tone: "primary" | "attention";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left shadow-soft transition-all hover:-translate-y-0.5 hover:border-primary/40 hover:shadow-lift focus-visible:border-primary"
    >
      <span
        className={cn(
          "grid size-12 shrink-0 place-items-center rounded-xl",
          tone === "primary" ? "bg-primary text-primary-foreground" : "bg-attention/12 text-attention-text",
        )}
      >
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold">{title}</span>
        <span className="block text-sm font-medium text-primary">{role}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-1" aria-hidden="true" />
    </button>
  );
}
