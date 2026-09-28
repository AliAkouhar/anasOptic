"use client";

import { FlaskConical, Loader2, MapPin, Pencil, Plus, Store } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { WhatsAppIcon } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { ResponsiveDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { locationsRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { nextInvoiceNumber } from "@/lib/calculations";
import { formatPhone } from "@/lib/format";
import type { Location, LocationType } from "@/lib/types";
import { cn } from "@/lib/utils";

function LocationDialog({ location, onClose }: { location?: Location; onClose: () => void }) {
  const t = useTranslations("settings.locations");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const feedback = useFeedback();
  const [name, setName] = useState(location?.name ?? "");
  const [type, setType] = useState<LocationType>(location?.type ?? "store");
  const [address, setAddress] = useState(location?.address ?? "");
  const [whatsapp, setWhatsapp] = useState(location ? formatPhone(location.whatsappNumber) : "");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setTouched(true);
    if (!name.trim()) return;
    setPending(true);
    try {
      const input = { name, type, address, whatsappNumber: whatsapp.replace(/\s/g, "") };
      if (location) {
        const { undo } = await locationsRepo.update(location.id, input);
        feedback.success(t("saved"), { undo });
      } else {
        const { location: created } = await locationsRepo.create(input);
        feedback.success(t("created", { name: created.name }));
      }
      onClose();
    } catch (e) {
      feedback.error(e);
    } finally {
      setPending(false);
    }
  };
  return (
    <ResponsiveDialog
      open
      onOpenChange={(o) => !o && onClose()}
      title={location ? t("editTitle") : t("createTitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={save} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="loc-name">{t("name")}</Label>
          <Input id="loc-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t("namePlaceholder")} aria-invalid={touched && !name.trim()} />
          {touched && !name.trim() && <p className="text-sm text-destructive">{te("name_required")}</p>}
        </div>
        <div className="space-y-2">
          <Label>{t("type")}</Label>
          <ChoiceChips label={t("type")} value={type} onChange={(v) => setType(v as LocationType)} options={(["store", "lab"] as const).map((ty) => ({ value: ty, label: t(`types.${ty}`) }))} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="loc-address">{t("address")}</Label>
          <Input id="loc-address" value={address} onChange={(e) => setAddress(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="loc-wa">{t("whatsapp")}</Label>
          <Input id="loc-wa" type="tel" inputMode="tel" className="num" value={whatsapp} onChange={(e) => setWhatsapp(e.target.value)} placeholder="06 00 00 00 00" />
        </div>
      </div>
    </ResponsiveDialog>
  );
}

export function LocationsTab() {
  const t = useTranslations("settings.locations");
  const feedback = useFeedback();
  const locations = useDb((db) => db.locations);
  const orders = useDb((db) => db.orders);
  const [editing, setEditing] = useState<Location | "new" | null>(null);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => setEditing("new")}>
          <Plus />
          {t("add")}
        </Button>
        <ul className="grid gap-4 md:grid-cols-2">
          {locations.map((l) => {
            const count = orders.filter((o) => o.locationId === l.id).length;
            const Icon = l.type === "lab" ? FlaskConical : Store;
            return (
              <li key={l.id} className={cn("rounded-2xl border p-4", !l.isActive && "opacity-60")}>
                <div className="flex items-start gap-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent text-accent-foreground">
                    <Icon className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold">{l.name}</p>
                      <Badge variant="secondary">{t(`types.${l.type}`)}</Badge>
                    </div>
                    <p className="mt-1 flex items-start gap-1.5 text-sm text-muted-foreground">
                      <MapPin className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
                      {l.address || "—"}
                    </p>
                    {l.whatsappNumber && (
                      <p className="num mt-0.5 flex items-center gap-1.5 text-sm text-muted-foreground">
                        <WhatsAppIcon className="size-3.5 text-whatsapp" />
                        {formatPhone(l.whatsappNumber)}
                      </p>
                    )}
                    {l.type === "store" && (
                      <p className="num mt-2 text-xs text-muted-foreground">
                        {t("orders", { count })} · {t("nextInvoice", { number: nextInvoiceNumber(orders, l.id) })}
                      </p>
                    )}
                  </div>
                  <Button variant="ghost" size="icon-sm" onClick={() => setEditing(l)} aria-label={`${t("editTitle")} · ${l.name}`}>
                    <Pencil />
                  </Button>
                </div>
                <label className="mt-3 flex items-center justify-end gap-2 text-sm">
                  {t("active")}
                  <Switch
                    checked={l.isActive}
                    onCheckedChange={async (v) => {
                      const { undo } = await locationsRepo.setActive(l.id, v);
                      feedback.success(v ? t("activated", { name: l.name }) : t("deactivated", { name: l.name }), { undo });
                    }}
                  />
                </label>
              </li>
            );
          })}
        </ul>
        {editing && <LocationDialog key={editing === "new" ? "new" : editing.id} location={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      </CardContent>
    </Card>
  );
}
