"use client";

import { Glasses, MapPin, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFormContext, useWatch } from "react-hook-form";
import { SegmentBadge, WhatsAppIcon } from "@/components/shared/badges";
import { useFormat, useLabels } from "@/data/hooks";
import { indexById } from "@/data/indexes";
import { useDb } from "@/data/store";
import { formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";
import { prescriptionLine } from "../prescription";
import type { OrderFormValues } from "./form";
import { useClientStats } from "./step-client";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium">{children}</span>
    </div>
  );
}

export function OrderSummary({ className }: { className?: string }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const form = useFormContext<OrderFormValues>();
  const v = useWatch({ control: form.control }) as OrderFormValues;
  const clients = useDb((db) => db.clients);
  const stats = useClientStats();
  const client = v.clientMode === "existing" && v.clientId ? indexById(clients).get(v.clientId) : undefined;
  const name = client?.fullName ?? (v.clientMode === "new" ? v.newClient?.fullName : "");
  const phone = client?.phone ?? (v.clientMode === "new" ? v.newClient?.phone : "");
  const whatsapp = client?.isWhatsapp ?? (v.clientMode === "new" ? v.newClient?.isWhatsapp : false);
  const segment = client ? stats.get(client.id)?.segment : undefined;
  const reste = Math.max(0, (v.total ?? 0) - (v.deposit ?? 0));
  const hasRx = [v.od, v.og].some((e) => e && Object.values(e).some((x) => x !== null));

  return (
    <div className={cn("space-y-4", className)}>
      <div className="flex items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
          <UserRound className="size-5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          {name ? (
            <>
              <p className="truncate font-semibold">{name}</p>
              <p className="num flex items-center gap-1 text-sm text-muted-foreground">
                {whatsapp && <WhatsAppIcon className="size-3.5 text-whatsapp" />}
                {phone ? formatPhone(phone) : "—"}
              </p>
              {segment && <SegmentBadge segment={segment} className="mt-1" />}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{t("wizard.noClientYet")}</p>
          )}
        </div>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <MapPin className="size-4" aria-hidden="true" />
        {labels.location(v.locationId)}
      </div>

      {hasRx && (
        <div className="space-y-1 rounded-xl bg-muted/60 p-3 text-sm">
          <p className="num">
            <span className="mr-2 font-bold">{t("rx.od")}</span>
            {prescriptionLine(v.od)}
          </p>
          <p className="num">
            <span className="mr-2 font-bold">{t("rx.og")}</span>
            {prescriptionLine(v.og)}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Row label={t("wizard.frame")}>
          {v.clientFrame ? t("detail.clientFrame") : v.frameProductId ? labels.product(v.frameProductId) : <span className="text-muted-foreground">{t("wizard.noFrame")}</span>}
        </Row>
        <Row label={t("wizard.lenses")}>
          {v.lensProductId ? (
            labels.product(v.lensProductId)
          ) : v.lensTypeId ? (
            labels.option(v.lensTypeId)
          ) : (
            <span className="text-muted-foreground">{t("wizard.noLens")}</span>
          )}
        </Row>
        {v.lensTreatmentIds?.length > 0 && (
          <p className="flex items-start gap-2 text-xs text-muted-foreground">
            <Glasses className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
            {v.lensTreatmentIds.map((id) => labels.option(id)).join(" · ")}
          </p>
        )}
      </div>

      <div className="space-y-2 border-t pt-4">
        <Row label={t("money.total")}>
          <span className="num">{v.total !== undefined ? f.money(v.total) : "—"}</span>
        </Row>
        <Row label={t("wizard.deposit")}>
          <span className="num">{v.deposit !== undefined ? f.money(v.deposit) : "—"}</span>
        </Row>
        <div className="flex items-baseline justify-between gap-3 pt-1">
          <span className="text-sm font-medium">{t("wizard.reste")}</span>
          <span className={cn("num text-2xl font-bold", reste > 0 ? "text-attention-text" : "text-success-text")}>{f.money(reste)}</span>
        </div>
      </div>
    </div>
  );
}
