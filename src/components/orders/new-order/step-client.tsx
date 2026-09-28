"use client";

import { Gift, Search, UserPlus, UserRound } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandItem, CommandList } from "@/components/ui/command";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { SegmentBadge, WhatsAppIcon } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { useFormat, useOrderScope } from "@/data/hooks";
import { clientStats, visibleClientIds } from "@/data/indexes";
import { useDbStore } from "@/data/store";
import { formatPhone, initials, normalizePhone } from "@/lib/format";
import type { Client, Location } from "@/lib/types";
import { cn } from "@/lib/utils";
import { formatPhoneTyping, type OrderFormValues } from "./form";

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

export function useClientStats() {
  const db = useDbStore((s) => s.db)!;
  const scope = useOrderScope();
  return useMemo(() => clientStats(db, scope === "none" ? [] : scope), [db, scope]);
}

export function StepClient({ locations }: { locations: Location[] }) {
  const t = useTranslations("wizard");
  const tc = useTranslations("common");
  const f = useFormat();
  const form = useFormContext<OrderFormValues>();
  const { errors } = form.formState;
  const mode = useWatch({ control: form.control, name: "clientMode" });
  const clientId = useWatch({ control: form.control, name: "clientId" });
  const locationId = useWatch({ control: form.control, name: "locationId" });
  const newClient = useWatch({ control: form.control, name: "newClient" });
  const db = useDbStore((s) => s.db)!;
  const scope = useOrderScope();
  const stats = useClientStats();
  const [query, setQuery] = useState("");

  const allowed = useMemo(() => visibleClientIds(db, scope === "none" ? [] : scope), [db, scope]);
  const pool = useMemo(() => (allowed ? db.clients.filter((c) => allowed.has(c.id)) : db.clients), [db.clients, allowed]);
  const results = useMemo(() => {
    const q = fold(query.trim());
    const digits = normalizePhone(query).replace(/^0/, "");
    if (!q) {
      return [...pool].sort((a, b) => (stats.get(b.id)?.lastVisit ?? b.createdAt).localeCompare(stats.get(a.id)?.lastVisit ?? a.createdAt)).slice(0, 6);
    }
    return pool.filter((c) => fold(c.fullName).includes(q) || (digits.length >= 2 && normalizePhone(c.phone).includes(digits))).slice(0, 8);
  }, [pool, query, stats]);

  const selected = clientId ? db.clients.find((c) => c.id === clientId) : undefined;
  const selectedStats = selected ? stats.get(selected.id) : undefined;
  const duplicate = useMemo(() => {
    const phone = normalizePhone(newClient.phone);
    return phone.length === 10 ? db.clients.find((c) => normalizePhone(c.phone) === phone) : undefined;
  }, [newClient.phone, db.clients]);

  const pick = (c: Client) => {
    form.setValue("clientMode", "existing");
    form.setValue("clientId", c.id, { shouldValidate: form.formState.isSubmitted });
    form.clearErrors("clientId");
    setQuery("");
  };

  return (
    <div className="space-y-6">
      {locations.length > 1 && (
        <div className="space-y-2">
          <Label htmlFor="order-location">{t("location")}</Label>
          <Select value={locationId} onValueChange={(v) => form.setValue("locationId", v)}>
            <SelectTrigger id="order-location" className="w-full sm:w-80">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {locations.map((l) => (
                <SelectItem key={l.id} value={l.id}>
                  {l.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      <ChoiceChips
        label={t("steps.client")}
        value={mode}
        onChange={(v) => form.setValue("clientMode", v as OrderFormValues["clientMode"])}
        options={[
          { value: "existing", label: <><UserRound className="size-4" />{t("existingClient")}</> },
          { value: "new", label: <><UserPlus className="size-4" />{t("newClient")}</> },
        ]}
      />

      {mode === "existing" &&
        (selected ? (
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-4 rounded-2xl border bg-accent/40 p-4">
              <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-base font-semibold text-primary-foreground">
                {initials(selected.fullName)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-lg font-semibold">{selected.fullName}</p>
                  {selectedStats && <SegmentBadge segment={selectedStats.segment} />}
                </div>
                <p className="num flex items-center gap-1.5 text-sm text-muted-foreground">
                  {selected.isWhatsapp && <WhatsAppIcon className="text-whatsapp" />}
                  {formatPhone(selected.phone)}
                  <span aria-hidden="true">·</span>
                  {selectedStats?.lastVisit ? t("lastVisit", { date: f.date(selectedStats.lastVisit) }) : t("neverVisited")}
                </p>
              </div>
              <Button type="button" variant="outline" onClick={() => form.setValue("clientId", undefined)}>
                {t("change")}
              </Button>
            </div>
            {selectedStats?.segment === "loyal" && (
              <div className="flex items-start gap-3 rounded-2xl border border-amber-300/60 bg-amber-50 p-4 text-amber-900 dark:border-amber-400/30 dark:bg-amber-500/10 dark:text-amber-200 motion-safe:animate-pop-in">
                <Gift className="mt-0.5 size-5 shrink-0" aria-hidden="true" />
                <div>
                  <p className="font-semibold">{t("loyalBanner")}</p>
                  <p className="text-sm opacity-90">
                    {t("loyalBannerBody", { count: selectedStats.globalOrderCount, date: f.date(selectedStats.firstVisit ?? selected.createdAt, "MMMM yyyy") })}
                  </p>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-2">
            <Label htmlFor="client-search">{t("searchClient")}</Label>
            <Command shouldFilter={false} className="rounded-2xl! border bg-card p-0">
              <div className="flex items-center gap-2 border-b px-3">
                <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                <input
                  id="client-search"
                  autoFocus
                  autoComplete="off"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("searchClientPlaceholder")}
                  className="h-12 w-full bg-transparent text-base outline-none placeholder:text-muted-foreground"
                  aria-invalid={!!errors.clientId}
                />
              </div>
              <CommandList className="max-h-80">
                <CommandEmpty className="px-4 py-6 text-sm">
                  <p className="text-muted-foreground">{t("noClientFound")}</p>
                  {query.trim() && (
                    <Button
                      type="button"
                      variant="outline"
                      className="mt-3"
                      onClick={() => {
                        const digits = query.replace(/\D/g, "");
                        form.setValue("clientMode", "new");
                        if (digits.length >= 6) form.setValue("newClient.phone", formatPhoneTyping(digits));
                        else form.setValue("newClient.fullName", query.trim());
                      }}
                    >
                      <UserPlus />
                      {t("createInstead", { name: query.trim() })}
                    </Button>
                  )}
                </CommandEmpty>
                <CommandGroup heading={query ? undefined : t("recentClients")}>
                  {results.map((c) => {
                    const s = stats.get(c.id);
                    return (
                      <CommandItem key={c.id} value={c.id} onSelect={() => pick(c)} className="gap-3 rounded-xl px-3 py-2.5">
                        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">
                          {initials(c.fullName)}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-medium">{c.fullName}</span>
                          <span className="num flex items-center gap-1 text-xs text-muted-foreground">
                            {c.isWhatsapp && <WhatsAppIcon className="size-3.5 text-whatsapp" />}
                            {formatPhone(c.phone)} · {s?.lastVisit ? t("lastVisit", { date: f.date(s.lastVisit) }) : t("neverVisited")}
                          </span>
                        </span>
                        {s && <SegmentBadge segment={s.segment} className="hidden sm:inline-flex" />}
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              </CommandList>
            </Command>
            {errors.clientId && <p className="text-sm text-destructive">{errors.clientId.message}</p>}
          </div>
        ))}

      {mode === "new" && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="new-client-name">{t("fullName")}</Label>
            <Input
              id="new-client-name"
              autoFocus
              autoComplete="off"
              autoCapitalize="words"
              placeholder={t("fullNamePlaceholder")}
              aria-invalid={!!errors.newClient?.fullName}
              {...form.register("newClient.fullName")}
            />
            {errors.newClient?.fullName && <p className="text-sm text-destructive">{errors.newClient.fullName.message}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="new-client-phone">{t("phone")}</Label>
            <Input
              id="new-client-phone"
              type="tel"
              inputMode="tel"
              autoComplete="off"
              placeholder={t("phonePlaceholder")}
              className="num"
              aria-invalid={!!errors.newClient?.phone}
              value={newClient.phone}
              onChange={(e) => form.setValue("newClient.phone", formatPhoneTyping(e.target.value), { shouldValidate: form.formState.isSubmitted })}
            />
            {errors.newClient?.phone && <p className="text-sm text-destructive">{errors.newClient.phone.message}</p>}
            {duplicate && (
              <Button type="button" variant="outline" size="sm" onClick={() => pick(duplicate)}>
                {t("useExisting")}{tc("colon")} {duplicate.fullName}
              </Button>
            )}
          </div>
          <label
            htmlFor="new-client-whatsapp"
            className={cn(
              "flex cursor-pointer items-center gap-3 self-start rounded-xl border p-3 transition-colors sm:mt-7",
              newClient.isWhatsapp && "border-whatsapp/40 bg-whatsapp/5",
            )}
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-full bg-whatsapp/10 text-whatsapp">
              <WhatsAppIcon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{t("whatsapp")}</span>
              <span className="block text-xs text-muted-foreground">{t("whatsappHint")}</span>
            </span>
            <Switch
              id="new-client-whatsapp"
              checked={newClient.isWhatsapp}
              onCheckedChange={(v) => form.setValue("newClient.isWhatsapp", v)}
            />
          </label>
        </div>
      )}
    </div>
  );
}
