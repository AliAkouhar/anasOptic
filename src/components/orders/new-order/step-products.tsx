"use client";

import { Check, Search } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { MoneyInput } from "@/components/shared/money-input";
import { useFormat, useLabels, useOptionList } from "@/data/hooks";
import { indexById, stockIndex } from "@/data/indexes";
import { useDb } from "@/data/store";
import { stockKey } from "@/lib/calculations";
import { cn } from "@/lib/utils";
import type { OrderFormValues } from "./form";

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function FramePicker() {
  const t = useTranslations("wizard");
  const tc = useTranslations("common");
  const f = useFormat();
  const labels = useLabels();
  const form = useFormContext<OrderFormValues>();
  const locationId = useWatch({ control: form.control, name: "locationId" });
  const clientFrame = useWatch({ control: form.control, name: "clientFrame" });
  const frameProductId = useWatch({ control: form.control, name: "frameProductId" });
  const products = useDb((db) => db.products);
  const movements = useDb((db) => db.stockMovements);
  const brands = useOptionList("brand");
  const [query, setQuery] = useState("");
  const [brandId, setBrandId] = useState<string>("all");
  const [categoryId, setCategoryId] = useState<string>("all");
  const [limit, setLimit] = useState(9);
  const error = form.formState.errors.frameProductId?.message;

  const frames = useMemo(() => products.filter((p) => p.kind === "frame" && p.isActive), [products]);
  const categories = useMemo(() => [...new Set(frames.map((p) => p.categoryId))], [frames]);
  const frameBrands = useMemo(() => brands.filter((b) => frames.some((p) => p.brandId === b.id)), [brands, frames]);
  const levels = stockIndex(movements);
  const list = useMemo(() => {
    const q = fold(query.trim());
    return frames
      .filter((p) => (brandId === "all" || p.brandId === brandId) && (categoryId === "all" || p.categoryId === categoryId))
      .filter((p) => !q || fold(labels.product(p.id)).includes(q))
      .map((p) => ({ product: p, qty: levels.get(stockKey(p.id, locationId)) ?? 0 }))
      .sort((a, b) => Number(b.qty > 0) - Number(a.qty > 0) || labels.product(a.product.id).localeCompare(labels.product(b.product.id)));
  }, [frames, brandId, categoryId, query, labels, levels, locationId]);
  const selected = frameProductId ? indexById(products).get(frameProductId) : undefined;

  return (
    <Section
      title={t("frame")}
      aside={
        <label className="flex cursor-pointer items-center gap-2 text-sm">
          <Switch
            checked={clientFrame}
            onCheckedChange={(v) => {
              form.setValue("clientFrame", v);
              if (v) {
                form.setValue("frameProductId", undefined);
                form.clearErrors("frameProductId");
              }
            }}
          />
          <span>{t("clientFrame")}</span>
        </label>
      }
    >
      {clientFrame ? (
        <p className="rounded-xl bg-muted/60 px-4 py-3 text-sm text-muted-foreground">{t("clientFrameHint")}</p>
      ) : (
        <>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative flex-1">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
              <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("searchFrame")} className="pl-9" aria-label={t("searchFrame")} />
            </div>
            <Select value={brandId} onValueChange={setBrandId}>
              <SelectTrigger className="w-full sm:w-48" aria-label={t("allBrands")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("allBrands")}</SelectItem>
                {frameBrands.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {labels.option(b.id)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <ChoiceChips
            label={tc("category")}
            value={categoryId}
            onChange={setCategoryId}
            options={[{ value: "all", label: t("allCategories") }, ...categories.map((c) => ({ value: c, label: labels.option(c) }))]}
          />
          {list.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("noFrameFound")}</p>
          ) : (
            <div role="radiogroup" aria-label={t("frame")} className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-2 xl:grid-cols-3">
              {list.slice(0, limit).map(({ product, qty }) => {
                const active = product.id === frameProductId;
                const out = qty <= 0;
                return (
                  <button
                    key={product.id}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={out}
                    onClick={() => form.setValue("frameProductId", product.id, { shouldValidate: form.formState.isSubmitted })}
                    className={cn(
                      "relative flex min-h-20 flex-col items-start gap-1 rounded-xl border bg-card p-3 text-left transition-all hover:border-primary/50 disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-border",
                      active && "border-primary bg-accent/50 ring-2 ring-primary",
                    )}
                  >
                    <span className="text-xs font-medium text-muted-foreground">{labels.option(product.brandId)}</span>
                    <span className="line-clamp-1 pr-6 text-sm font-semibold">{product.name}</span>
                    <span className="mt-auto flex w-full items-center justify-between gap-2">
                      <span className="num text-sm">{product.salePrice ? f.money(product.salePrice) : "—"}</span>
                      <span
                        className={cn(
                          "num rounded-full px-2 py-0.5 text-[11px] font-semibold",
                          out ? "bg-destructive/10 text-destructive" : qty <= 2 ? "bg-attention/10 text-attention-text" : "bg-success/10 text-success-text",
                        )}
                      >
                        {out ? t("outOfStock") : t("inStock", { count: qty })}
                      </span>
                    </span>
                    {active && (
                      <span className="absolute top-2 right-2 grid size-5 place-items-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-3.5" aria-hidden="true" />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
          {list.length > limit && (
            <Button type="button" variant="ghost" className="w-full" onClick={() => setLimit((l) => l + 12)}>
              {t("showMore")} ({list.length - limit})
            </Button>
          )}
          {selected && !list.slice(0, limit).some((x) => x.product.id === selected.id) && (
            <p className="text-sm">
              <Check className="mr-1 inline size-4 text-primary" aria-hidden="true" />
              {labels.product(selected.id)}
            </p>
          )}
        </>
      )}
      {error && !clientFrame && <p className="text-sm text-destructive">{error}</p>}
      <div className="space-y-2">
        <Label htmlFor="frame-description" className="text-muted-foreground">
          {t("frameDescription")}
        </Label>
        <Input id="frame-description" {...form.register("frameDescription")} />
      </div>
    </Section>
  );
}

function LensPicker() {
  const t = useTranslations("wizard");
  const f = useFormat();
  const labels = useLabels();
  const form = useFormContext<OrderFormValues>();
  const lensTypeId = useWatch({ control: form.control, name: "lensTypeId" });
  const lensProductId = useWatch({ control: form.control, name: "lensProductId" });
  const treatments = useWatch({ control: form.control, name: "lensTreatmentIds" });
  const types = useOptionList("lens_type");
  const treatmentOptions = useOptionList("lens_treatment");
  const products = useDb((db) => db.products);
  const lenses = useMemo(
    () => products.filter((p) => p.kind === "lens" && p.isActive && (!lensTypeId || p.lensTypeId === lensTypeId)),
    [products, lensTypeId],
  );

  return (
    <Section title={t("lenses")}>
      <div className="space-y-2">
        <Label>{t("lensType")}</Label>
        <ChoiceChips
          label={t("lensType")}
          value={lensTypeId}
          onChange={(v) => {
            form.setValue("lensTypeId", v);
            const current = lensProductId ? products.find((p) => p.id === lensProductId) : undefined;
            if (current && current.lensTypeId !== v) form.setValue("lensProductId", undefined);
          }}
          options={types.map((o) => ({ value: o.id, label: labels.option(o.id) }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lens-product">{t("lensProduct")}</Label>
        <Select value={lensProductId ?? "none"} onValueChange={(v) => form.setValue("lensProductId", v === "none" ? undefined : v)}>
          <SelectTrigger id="lens-product" className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="none">{t("lensProductNone")}</SelectItem>
            {lenses.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                <span className="flex-1">{labels.product(p.id)}</span>
                {p.salePrice ? <span className="num text-xs text-muted-foreground">{t("lensPrice", { price: f.money(p.salePrice) })}</span> : null}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="space-y-2">
        <Label>{t("treatments")}</Label>
        <ChoiceChips
          multiple
          label={t("treatments")}
          value={treatments}
          onChange={(v) => form.setValue("lensTreatmentIds", v)}
          options={treatmentOptions.map((o) => ({ value: o.id, label: labels.option(o.id) }))}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="lens-description" className="text-muted-foreground">
          {t("lensDescription")}
        </Label>
        <Input id="lens-description" placeholder={t("lensDescriptionPlaceholder")} {...form.register("lensDescription")} />
      </div>
    </Section>
  );
}

function PaymentSection() {
  const t = useTranslations("wizard");
  const f = useFormat();
  const labels = useLabels();
  const form = useFormContext<OrderFormValues>();
  const total = useWatch({ control: form.control, name: "total" });
  const deposit = useWatch({ control: form.control, name: "deposit" });
  const methodId = useWatch({ control: form.control, name: "paymentMethodId" });
  const frameProductId = useWatch({ control: form.control, name: "frameProductId" });
  const lensProductId = useWatch({ control: form.control, name: "lensProductId" });
  const products = useDb((db) => db.products);
  const methods = useOptionList("payment_method");
  const { errors, isSubmitted } = form.formState;
  const productMap = indexById(products);
  const catalog = (productMap.get(frameProductId ?? "")?.salePrice ?? 0) + (productMap.get(lensProductId ?? "")?.salePrice ?? 0) * 2;
  const reste = Math.max(0, (total ?? 0) - (deposit ?? 0));

  const setMoney = (name: "total" | "deposit", v: number | undefined) => form.setValue(name, v, { shouldValidate: isSubmitted });

  return (
    <Section title={t("payment")}>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="order-total">{t("total")}</Label>
          <MoneyInput id="order-total" size="lg" value={total} onChange={(v) => setMoney("total", v)} invalid={!!errors.total} aria-describedby="order-total-msg" />
          {errors.total ? (
            <p id="order-total-msg" className="text-sm text-destructive">
              {errors.total.message}
            </p>
          ) : catalog > 0 && catalog !== total ? (
            <p id="order-total-msg" className="flex items-center gap-2 text-sm text-muted-foreground">
              {t("catalogPrice", { amount: f.money(catalog) })}
              <Button type="button" variant="link" size="sm" className="h-auto px-0" onClick={() => setMoney("total", catalog)}>
                {t("useCatalogPrice")}
              </Button>
            </p>
          ) : null}
        </div>
        <div className="space-y-2">
          <Label htmlFor="order-deposit">{t("deposit")}</Label>
          <MoneyInput id="order-deposit" size="lg" value={deposit} onChange={(v) => setMoney("deposit", v)} invalid={!!errors.deposit} aria-describedby="order-deposit-msg" />
          <div className="flex gap-2" role="group" aria-label={t("depositChips")}>
            {[0.3, 0.5, 1].map((ratio) => (
              <Button
                key={ratio}
                type="button"
                variant="outline"
                size="sm"
                className="num flex-1 rounded-full"
                disabled={!total}
                onClick={() => setMoney("deposit", ratio === 1 ? total : Math.round(((total ?? 0) * ratio) / 10) * 10)}
              >
                {ratio * 100} %
              </Button>
            ))}
          </div>
          {errors.deposit && (
            <p id="order-deposit-msg" className="text-sm text-destructive">
              {errors.deposit.message}
            </p>
          )}
        </div>
      </div>
      <div className="space-y-2">
        <Label>{t("paymentMethod")}</Label>
        <ChoiceChips
          label={t("paymentMethod")}
          value={methodId}
          onChange={(v) => form.setValue("paymentMethodId", v)}
          options={methods.map((m) => ({ value: m.id, label: labels.option(m.id) }))}
        />
      </div>
      <div
        className={cn(
          "flex items-center justify-between rounded-2xl px-5 py-4 transition-colors",
          reste > 0 ? "bg-attention/10 text-attention-text" : "bg-success/10 text-success-text",
        )}
        aria-live="polite"
      >
        <span className="font-medium">{t("reste")}</span>
        <span className="num text-3xl font-bold tracking-tight">{f.money(reste)}</span>
      </div>
    </Section>
  );
}

export function StepProducts() {
  return (
    <div className="space-y-8">
      <FramePicker />
      <div className="border-t" />
      <LensPicker />
      <div className="border-t" />
      <PaymentSection />
    </div>
  );
}
