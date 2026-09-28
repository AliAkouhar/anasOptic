"use client";

import { Building2, FlaskConical, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useActiveLocation, useActiveLocations, useLabels, useRequiredAuth } from "@/data/hooks";
import { can } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Admin: "Toutes les succursales" or one. Scoped users see their own location as a static chip. */
export function LocationSelector({ className }: { className?: string }) {
  const t = useTranslations();
  const auth = useRequiredAuth();
  const [active, setActive] = useActiveLocation();
  const locations = useActiveLocations();
  const labels = useLabels();

  if (!can(auth, "orders.view_all") && !can(auth, "stock.view_all")) {
    if (!auth.user.locationId) return null;
    return (
      <span className={cn("inline-flex h-9 items-center gap-2 rounded-full bg-accent px-3 text-sm font-medium text-accent-foreground", className)}>
        <MapPin className="size-4" aria-hidden="true" />
        <span className="truncate">{labels.location(auth.user.locationId)}</span>
      </span>
    );
  }

  return (
    <Select value={active} onValueChange={setActive}>
      <SelectTrigger className={cn("w-full min-w-0 sm:w-60", className)} aria-label={t("shell.locationSelector")} title={t("shell.locationSelector")}>
        <Building2 className="text-muted-foreground" aria-hidden="true" />
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">{t("common.allLocations")}</SelectItem>
        <SelectGroup>
          <SelectLabel>{t("common.locations")}</SelectLabel>
          {locations
            .filter((l) => l.type === "store")
            .map((l) => (
              <SelectItem key={l.id} value={l.id}>
                {l.name}
              </SelectItem>
            ))}
        </SelectGroup>
        <SelectGroup>
          <SelectLabel>{t("common.lab")}</SelectLabel>
          {locations
            .filter((l) => l.type === "lab")
            .map((l) => (
              <SelectItem key={l.id} value={l.id}>
                <FlaskConical className="text-muted-foreground" aria-hidden="true" />
                {l.name}
              </SelectItem>
            ))}
        </SelectGroup>
      </SelectContent>
    </Select>
  );
}
