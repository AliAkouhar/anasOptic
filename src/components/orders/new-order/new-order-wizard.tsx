"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { ArrowLeft, ArrowRight, Check, ChevronUp, Loader2, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useRef, useState } from "react";
import { FormProvider, useForm, useWatch, type FieldPath } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Drawer, DrawerContent, DrawerDescription, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { PageHeader } from "@/components/shared/page";
import { useFeedback } from "@/components/shared/feedback";
import { useActiveLocation, useFormat, useLabels, useOptionList, useRequiredAuth } from "@/data/hooks";
import { isRepoError, ordersRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { Link } from "@/i18n/navigation";
import { creatableLocations } from "@/lib/permissions";
import type { Order } from "@/lib/types";
import { cn } from "@/lib/utils";
import { buildOrderSchema, defaultValues, STEP_FIELDS, type OrderFormValues } from "./form";
import { OrderSummary } from "./order-summary";
import { StepClient } from "./step-client";
import { StepMeasures } from "./step-measures";
import { StepProducts } from "./step-products";

const STEPS = ["client", "measures", "products"] as const;

function Stepper({ step, maxReached, onGo }: { step: number; maxReached: number; onGo: (i: number) => void }) {
  const t = useTranslations("wizard");
  return (
    <ol className="flex items-center gap-2" aria-label={t("stepOf", { current: step + 1, total: STEPS.length })}>
      {STEPS.map((key, i) => {
        const done = i < step;
        const current = i === step;
        const reachable = i <= maxReached && i !== step;
        return (
          <li key={key} className="flex flex-1 items-center gap-2 last:flex-none sm:last:flex-1">
            <button
              type="button"
              disabled={!reachable}
              onClick={() => onGo(i)}
              aria-current={current ? "step" : undefined}
              className={cn("flex items-center gap-2 rounded-full pr-1 text-left disabled:cursor-default", reachable && "hover:opacity-80")}
            >
              <span
                className={cn(
                  "grid size-9 shrink-0 place-items-center rounded-full border-2 text-sm font-semibold transition-colors",
                  current && "border-primary bg-primary text-primary-foreground",
                  done && "border-primary bg-accent text-primary",
                  !current && !done && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" aria-hidden="true" /> : i + 1}
              </span>
              <span className={cn("text-sm font-medium", current ? "text-foreground" : "hidden text-muted-foreground sm:inline")}>{t(`steps.${key}`)}</span>
            </button>
            {i < STEPS.length - 1 && <span className={cn("h-0.5 flex-1 rounded-full", i < step ? "bg-primary" : "bg-border")} aria-hidden="true" />}
          </li>
        );
      })}
    </ol>
  );
}

function SuccessScreen({ order, clientName, reste, onAnother }: { order: Order; clientName: string; reste: number; onAnother: () => void }) {
  const t = useTranslations("wizard");
  const f = useFormat();
  const labels = useLabels();
  return (
    <div className="mx-auto flex max-w-lg flex-col items-center py-10 text-center sm:py-16" role="status" aria-live="polite">
      <svg viewBox="0 0 52 52" className="size-24 text-success" aria-hidden="true">
        <circle cx="26" cy="26" r="24" className="fill-success/12" />
        <circle cx="26" cy="26" r="24" fill="none" stroke="currentColor" strokeWidth="2.5" className="motion-safe:animate-pop-in" />
        <path
          d="M15 27l7 7 15-16"
          fill="none"
          stroke="currentColor"
          strokeWidth="4"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray="48"
          className="motion-safe:animate-draw-check"
        />
      </svg>
      <h1 className="mt-6 text-2xl font-semibold">{t("successTitle")}</h1>
      <p className="num mt-3 text-3xl font-bold tracking-tight text-primary sm:text-4xl motion-safe:animate-rise">
        {t("successNumber", { number: order.invoiceNumber, location: labels.location(order.locationId) })}
      </p>
      <p className="mt-3 text-muted-foreground">{t("successBody", { client: clientName, reste: f.money(reste) })}</p>
      <div className="mt-8 flex w-full flex-col gap-3 sm:flex-row sm:justify-center">
        <Button size="lg" onClick={onAnother}>
          <Plus />
          {t("another")}
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href={`/orders/${order.id}`}>{t("viewOrder")}</Link>
        </Button>
      </div>
    </div>
  );
}

export function NewOrderWizard() {
  const t = useTranslations();
  const feedback = useFeedback();
  const auth = useRequiredAuth();
  const locations = useDb((db) => db.locations);
  const [activeLocation] = useActiveLocation();
  const methods = useOptionList("payment_method");
  const search = useSearchParams();
  const allowedLocations = useMemo(() => creatableLocations(auth, locations), [auth, locations]);
  const initialLocation =
    allowedLocations.find((l) => l.id === activeLocation)?.id ?? allowedLocations.find((l) => l.id === auth.user.locationId)?.id ?? allowedLocations[0]?.id ?? "";

  const schema = useMemo(
    () => buildOrderSchema((key, values) => t(key as Parameters<typeof t>[0], values as never)),
    [t],
  );
  const makeDefaults = () => defaultValues(initialLocation, methods[0]?.id ?? "", search.get("client") ?? undefined);
  const form = useForm<OrderFormValues>({ resolver: zodResolver(schema), defaultValues: makeDefaults(), mode: "onSubmit" });
  const [step, setStep] = useState(0);
  const [maxReached, setMaxReached] = useState(0);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [created, setCreated] = useState<{ order: Order; clientName: string; reste: number } | null>(null);
  const topRef = useRef<HTMLDivElement>(null);
  const total = useWatch({ control: form.control, name: "total" });
  const deposit = useWatch({ control: form.control, name: "deposit" });
  const reste = Math.max(0, (total ?? 0) - (deposit ?? 0));
  const f = useFormat();

  const goTo = (i: number) => {
    setStep(i);
    setMaxReached((m) => Math.max(m, i));
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const next = async () => {
    const ok = await form.trigger(STEP_FIELDS[step] as unknown as FieldPath<OrderFormValues>[], { shouldFocus: true });
    if (!ok) {
      toast.error(t("wizard.fixErrors"));
      return;
    }
    goTo(step + 1);
  };

  const submit = () =>
    form.handleSubmit(
    async (v) => {
      try {
        const { order, client } = await ordersRepo.create({
          locationId: v.locationId,
          client: v.clientMode === "existing" && v.clientId ? { id: v.clientId } : v.newClient,
          od: v.od,
          og: v.og,
          customValues: Object.fromEntries(
            Object.entries(v.customValues)
              .filter(([, val]) => val !== "")
              .map(([k, val]) => [k, /^-?\d+([.,]\d+)?$/.test(val) ? Number(val.replace(",", ".")) : val]),
          ),
          frameProductId: v.clientFrame ? undefined : v.frameProductId,
          frameDescription: v.clientFrame ? [t("detail.clientFrame"), v.frameDescription].filter(Boolean).join(" · ") : v.frameDescription,
          lensProductId: v.lensProductId,
          lensQty: 2,
          lensTypeId: v.lensTypeId,
          lensTreatmentIds: v.lensTreatmentIds,
          lensDescription: v.lensDescription,
          total: v.total ?? 0,
          deposit: v.deposit ?? 0,
          paymentMethodId: v.paymentMethodId,
        });
        setCreated({ order, clientName: client.fullName, reste: order.total - (v.deposit ?? 0) });
        window.scrollTo({ top: 0, behavior: "smooth" });
      } catch (e) {
        if (isRepoError(e) && (e.code === "duplicate_phone" || e.code === "invalid_phone" || e.code === "name_required")) goTo(0);
        feedback.error(e);
      }
    },
    (errors) => {
      const firstStep = STEP_FIELDS.findIndex((fields) => fields.some((name) => name.split(".").reduce<unknown>((o, k) => (o as Record<string, unknown> | undefined)?.[k], errors)));
      if (firstStep >= 0 && firstStep !== step) goTo(firstStep);
    },
  )();

  if (created) {
    return (
      <SuccessScreen
        order={created.order}
        clientName={created.clientName}
        reste={created.reste}
        onAnother={() => {
          form.reset(defaultValues(initialLocation, methods[0]?.id ?? ""));
          setCreated(null);
          setStep(0);
          setMaxReached(0);
        }}
      />
    );
  }

  const isLast = step === STEPS.length - 1;
  const { isSubmitting } = form.formState;

  return (
    <FormProvider {...form}>
      <div ref={topRef} className="scroll-mt-20" />
      <PageHeader title={t("wizard.title")} description={t("wizard.stepOf", { current: step + 1, total: STEPS.length })} />
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (isLast) void submit();
          else void next();
        }}
        noValidate
        className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_340px] xl:grid-cols-[minmax(0,1fr)_380px]"
      >
        <div className="min-w-0 space-y-5">
          <Stepper step={step} maxReached={maxReached} onGo={goTo} />
          <Card>
            <CardContent className="py-1">
              <h2 className="mb-5 text-lg font-semibold">{t(`wizard.steps.${STEPS[step]}`)}</h2>
              <div key={step} className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-right-2 motion-safe:duration-200">
                {step === 0 && <StepClient locations={allowedLocations} />}
                {step === 1 && <StepMeasures />}
                {step === 2 && <StepProducts />}
              </div>
            </CardContent>
          </Card>
          <div className="hidden items-center justify-between md:flex lg:hidden">
            <Button type="button" variant="outline" size="lg" disabled={step === 0} onClick={() => goTo(step - 1)}>
              <ArrowLeft />
              {t("common.previous")}
            </Button>
            <Button type="submit" size="lg" variant={isLast ? "attention" : "default"} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isLast ? t("wizard.validate") : t("common.next")}
              {!isLast && <ArrowRight />}
            </Button>
          </div>
        </div>

        <aside className="hidden lg:block">
          <Card className="sticky top-24">
            <CardContent className="space-y-5">
              <h2 className="text-base font-semibold">{t("wizard.summary")}</h2>
              <OrderSummary />
              <div className="flex gap-2 border-t pt-4">
                <Button type="button" variant="outline" size="lg" disabled={step === 0} onClick={() => goTo(step - 1)} aria-label={t("common.previous")}>
                  <ArrowLeft />
                </Button>
                <Button type="submit" size="lg" className="flex-1" variant={isLast ? "attention" : "default"} disabled={isSubmitting}>
                  {isSubmitting && <Loader2 className="animate-spin" />}
                  {isLast ? (isSubmitting ? t("wizard.validating") : t("wizard.validate")) : t("common.next")}
                  {!isLast && <ArrowRight />}
                </Button>
              </div>
            </CardContent>
          </Card>
        </aside>

        {/* Phones: sticky action bar + summary in a bottom sheet. */}
        <div className="pb-safe fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden">
          <button
            type="button"
            onClick={() => setSummaryOpen(true)}
            className="flex w-full items-center justify-between px-4 pt-2 text-sm"
            aria-haspopup="dialog"
          >
            <span className="flex items-center gap-1 text-muted-foreground">
              <ChevronUp className="size-4" aria-hidden="true" />
              {t("wizard.summary")}
            </span>
            <span className={cn("num font-semibold", reste > 0 ? "text-attention-text" : "text-success-text")}>
              {t("money.resteShort", { amount: f.money(reste) })}
            </span>
          </button>
          <div className="flex gap-2 px-4 py-2">
            <Button type="button" variant="outline" size="lg" disabled={step === 0} onClick={() => goTo(step - 1)} aria-label={t("common.previous")}>
              <ArrowLeft />
            </Button>
            <Button type="submit" size="lg" className="flex-1" variant={isLast ? "attention" : "default"} disabled={isSubmitting}>
              {isSubmitting && <Loader2 className="animate-spin" />}
              {isLast ? t("wizard.validate") : t("common.next")}
              {!isLast && <ArrowRight />}
            </Button>
          </div>
        </div>
      </form>

      <Drawer open={summaryOpen} onOpenChange={setSummaryOpen}>
        <DrawerContent>
          <DrawerHeader>
            <DrawerTitle>{t("wizard.summary")}</DrawerTitle>
            <DrawerDescription className="sr-only">{t("wizard.summary")}</DrawerDescription>
          </DrawerHeader>
          <div className="max-h-[70dvh] overflow-y-auto px-4 pb-8">
            <OrderSummary />
          </div>
        </DrawerContent>
      </Drawer>
    </FormProvider>
  );
}
