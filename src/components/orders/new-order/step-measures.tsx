"use client";

import { ArrowDownToLine, Copy, History } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useFormat, useLabels, useOrderScope } from "@/data/hooks";
import { customFieldOptions, ordersByClient } from "@/data/indexes";
import { useDb } from "@/data/store";
import type { CustomField } from "@/lib/types";
import { PrescriptionEditor, type Eye, type RxField } from "../prescription";
import type { OrderFormValues } from "./form";

export function CustomFieldInput({
  field,
  value,
  onChange,
}: {
  field: CustomField;
  value: string;
  onChange: (v: string) => void;
}) {
  const labels = useLabels();
  const id = `cf-${field.id}`;
  const label = labels.localized(field);
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {field.type === "select" ? (
        <Select value={value} onValueChange={onChange}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue placeholder="—" />
          </SelectTrigger>
          <SelectContent>
            {customFieldOptions(field, labels.lang).map((o, i) => (
              <SelectItem key={i} value={field.optionsFr?.[i] ?? o}>
                {o}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <Input
          id={id}
          type={field.type === "date" ? "date" : "text"}
          inputMode={field.type === "number" ? "decimal" : undefined}
          className={field.type === "number" ? "num" : undefined}
          value={value}
          onChange={(e) => onChange(field.type === "number" ? e.target.value.replace(/[^\d.,-]/g, "") : e.target.value)}
        />
      )}
    </div>
  );
}

export function StepMeasures() {
  const t = useTranslations();
  const f = useFormat();
  const form = useFormContext<OrderFormValues>();
  const od = useWatch({ control: form.control, name: "od" });
  const og = useWatch({ control: form.control, name: "og" });
  const clientId = useWatch({ control: form.control, name: "clientId" });
  const clientMode = useWatch({ control: form.control, name: "clientMode" });
  const customValues = useWatch({ control: form.control, name: "customValues" });
  const orders = useDb((db) => db.orders);
  const customFields = useDb((db) => db.customFields);
  const scope = useOrderScope();
  const { errors } = form.formState;

  const lastOrder = useMemo(() => {
    if (clientMode !== "existing" || !clientId) return undefined;
    const list = (ordersByClient(orders).get(clientId) ?? []).filter(
      (o) => o.status !== "cancelled" && (scope === null || (scope !== "none" && scope.includes(o.locationId))),
    );
    return list.reduce<(typeof list)[number] | undefined>((best, o) => (!best || o.createdAt > best.createdAt ? o : best), undefined);
  }, [clientMode, clientId, orders, scope]);

  const fields = useMemo(() => customFields.filter((c) => c.isActive).sort((a, b) => a.sortOrder - b.sortOrder), [customFields]);

  const setEye = (eye: Eye, rx: OrderFormValues["od"]) => form.setValue(eye, rx, { shouldValidate: form.formState.isSubmitted });

  const rxErrors: Partial<Record<Eye, Partial<Record<RxField, string>>>> = {};
  for (const eye of ["od", "og"] as const) {
    const e = errors[eye];
    if (e) rxErrors[eye] = { sph: e.sph?.message, cyl: e.cyl?.message, axis: e.axis?.message, add: e.add?.message };
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setEye("og", { ...od });
            toast.success(t("rx.copied"));
          }}
        >
          <Copy />
          {t("rx.copyOdToOg")}
        </Button>
        {lastOrder && (
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setEye("od", { ...lastOrder.od });
              setEye("og", { ...lastOrder.og });
              toast.success(t("rx.reused"));
            }}
          >
            <History />
            <span className="flex flex-col items-start leading-tight">
              <span>{t("rx.reuseLast")}</span>
              <span className="text-xs font-normal text-muted-foreground">{t("rx.reuseLastHint", { date: f.date(lastOrder.createdAt) })}</span>
            </span>
          </Button>
        )}
      </div>

      <PrescriptionEditor value={{ od, og }} onChange={setEye} errors={rxErrors} />

      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <ArrowDownToLine className="size-3.5" aria-hidden="true" />
        {t("wizard.measuresHint")}
      </p>

      {fields.length > 0 && (
        <div className="space-y-3 border-t pt-5">
          <h3 className="text-sm font-semibold">{t("wizard.customFields")}</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {fields.map((field) => (
              <CustomFieldInput
                key={field.id}
                field={field}
                value={customValues[field.id] ?? ""}
                onChange={(v) => form.setValue("customValues", { ...customValues, [field.id]: v })}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
