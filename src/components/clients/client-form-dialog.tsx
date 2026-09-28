"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { WhatsAppIcon } from "@/components/shared/badges";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { formatPhoneTyping } from "@/components/orders/new-order/form";
import { useActiveLocation, useActiveLocations, useRequiredAuth } from "@/data/hooks";
import { clientsRepo, isRepoError } from "@/data/repositories";
import { formatPhone, isValidMoroccanMobile } from "@/lib/format";
import { can } from "@/lib/permissions";
import type { Client } from "@/lib/types";

/** Create or edit a client (name, Moroccan mobile, WhatsApp flag). */
export function ClientFormDialog({
  open,
  onOpenChange,
  client,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  client?: Client;
  onCreated?: (c: Client) => void;
}) {
  const t = useTranslations();
  const feedback = useFeedback();
  const auth = useRequiredAuth();
  const stores = useActiveLocations("store");
  const [active] = useActiveLocation();
  const canPick = can(auth, "orders.view_all");
  const defaultLocation = client?.locationId ?? (canPick ? (stores.find((s) => s.id === active)?.id ?? stores[0]?.id) : auth.user.locationId) ?? "";

  const schema = useMemo(
    () =>
      z.object({
        fullName: z.string().trim().min(1, { message: t("errors.name_required") }),
        phone: z.string().refine(isValidMoroccanMobile, { message: t("errors.invalid_phone") }),
        isWhatsapp: z.boolean(),
        locationId: z.string().min(1),
      }),
    [t],
  );
  type Values = z.infer<typeof schema>;
  const form = useForm<Values>({
    resolver: zodResolver(schema),
    values: {
      fullName: client?.fullName ?? "",
      phone: client ? formatPhone(client.phone) : "",
      isWhatsapp: client?.isWhatsapp ?? true,
      locationId: defaultLocation,
    },
  });
  const { errors, isSubmitting } = form.formState;
  const whatsapp = useWatch({ control: form.control, name: "isWhatsapp" });
  const phone = useWatch({ control: form.control, name: "phone" });
  const locationId = useWatch({ control: form.control, name: "locationId" });

  const submit = form.handleSubmit(async (v) => {
    try {
      if (client) {
        const { undo } = await clientsRepo.update(client.id, v);
        feedback.success(t("clients.saved"), { undo });
      } else {
        const { client: created } = await clientsRepo.create(v);
        feedback.success(t("clients.created", { name: created.fullName }));
        onCreated?.(created);
      }
      onOpenChange(false);
    } catch (e) {
      if (isRepoError(e) && (e.code === "duplicate_phone" || e.code === "invalid_phone")) {
        form.setError("phone", { message: feedback.errorMessage(e) });
      } else feedback.error(e);
    }
  });

  return (
    <ResponsiveDialog
      open={open}
      onOpenChange={onOpenChange}
      title={client ? t("clients.editTitle") : t("clients.createTitle")}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={isSubmitting}>
            {isSubmitting && <Loader2 className="animate-spin" />}
            {t("common.save")}
          </Button>
        </>
      }
    >
      <form onSubmit={submit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="client-name">{t("wizard.fullName")}</Label>
          <Input id="client-name" autoComplete="off" placeholder={t("wizard.fullNamePlaceholder")} aria-invalid={!!errors.fullName} {...form.register("fullName")} />
          {errors.fullName && <p className="text-sm text-destructive">{errors.fullName.message}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="client-phone">{t("wizard.phone")}</Label>
          <Input
            id="client-phone"
            type="tel"
            inputMode="tel"
            className="num"
            placeholder={t("wizard.phonePlaceholder")}
            aria-invalid={!!errors.phone}
            value={phone}
            onChange={(e) => form.setValue("phone", formatPhoneTyping(e.target.value), { shouldValidate: form.formState.isSubmitted })}
          />
          {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
        </div>
        <label htmlFor="client-whatsapp" className="flex cursor-pointer items-center gap-3 rounded-xl border p-3">
          <WhatsAppIcon className="size-5 text-whatsapp" />
          <span className="flex-1">
            <span className="block text-sm font-medium">{t("wizard.whatsapp")}</span>
            <span className="block text-xs text-muted-foreground">{t("wizard.whatsappHint")}</span>
          </span>
          <Switch id="client-whatsapp" checked={whatsapp} onCheckedChange={(v) => form.setValue("isWhatsapp", v)} />
        </label>
        {!client && canPick && (
          <div className="space-y-2">
            <Label htmlFor="client-location">{t("clients.location")}</Label>
            <Select value={locationId} onValueChange={(v) => form.setValue("locationId", v)}>
              <SelectTrigger id="client-location" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {stores.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </form>
    </ResponsiveDialog>
  );
}
