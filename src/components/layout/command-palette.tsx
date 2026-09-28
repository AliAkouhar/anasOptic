"use client";

import { FileText, Plus, User } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import {
  Command,
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { StatusBadge, WhatsAppIcon } from "@/components/shared/badges";
import { useLabels, useOrderScope, useRequiredAuth, useScopedOrderViews } from "@/data/hooks";
import { visibleClientIds } from "@/data/indexes";
import { useDbStore } from "@/data/store";
import { useRouter } from "@/i18n/navigation";
import { formatPhone, normalizePhone } from "@/lib/format";
import { can, visibleNav } from "@/lib/permissions";
import { NAV_ICONS, usePalette } from "./nav-config";

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Ctrl/⌘ K: search clients (name or phone), orders (N°) and pages. */
export function CommandPalette() {
  const t = useTranslations();
  const open = usePalette((s) => s.open);
  const setOpen = usePalette((s) => s.setOpen);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        usePalette.setState((s) => ({ open: !s.open }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <CommandDialog
      open={open}
      onOpenChange={setOpen}
      title={t("shell.searchShort")}
      description={t("palette.hint")}
      className="top-[12%] translate-y-0 rounded-2xl sm:max-w-xl"
    >
      {/* The search data (orders joined with clients…) is only built while the palette is open. */}
      {open && <PaletteBody onClose={() => setOpen(false)} />}
    </CommandDialog>
  );
}

function PaletteBody({ onClose }: { onClose: () => void }) {
  const t = useTranslations();
  const router = useRouter();
  const auth = useRequiredAuth();
  const [query, setQuery] = useState("");
  const labels = useLabels();
  const views = useScopedOrderViews();
  const scope = useOrderScope();

  const results = useMemo(() => {
    const q = fold(query.trim());
    const digits = normalizePhone(query).replace(/^0/, "");
    const db = useDbStore.getState().db!;
    const pages = visibleNav(auth).filter((p) => !q || fold(t(`nav.${p.key}`)).includes(q));
    if (!q) return { pages, clients: [], orders: views.slice(-5).reverse() };
    const scopeIds = scope === "none" ? [] : scope;
    const allowed = can(auth, "clients.manage") ? visibleClientIds(db, scopeIds) : new Set<string>();
    const clients = db.clients
      .filter((c) => (!allowed || allowed.has(c.id)) && (fold(c.fullName).includes(q) || (digits.length >= 3 && normalizePhone(c.phone).includes(digits))))
      .slice(0, 6);
    const number = query.replace(/[^\d]/g, "");
    const orders = views
      .filter((v) => (number && String(v.order.invoiceNumber).startsWith(number)) || (v.client && fold(v.client.fullName).includes(q)))
      .sort((a, b) => b.order.createdAt.localeCompare(a.order.createdAt))
      .slice(0, 6);
    return { pages, clients, orders };
  }, [query, auth, views, scope, t]);

  const go = (href: string) => {
    onClose();
    router.push(href);
  };

  return (
    <Command shouldFilter={false} className="rounded-2xl!">
      <CommandInput placeholder={t("palette.placeholder")} value={query} onValueChange={setQuery} />
      <CommandList className="max-h-[60dvh]">
        <CommandEmpty>{t("palette.empty", { query })}</CommandEmpty>
        {can(auth, "orders.create") && !query && (
          <CommandGroup heading={t("palette.actions")}>
            <CommandItem value="action-new-order" onSelect={() => go("/orders/new")}>
              <Plus />
              {t("nav.newOrder")}
            </CommandItem>
          </CommandGroup>
        )}
        {results.clients.length > 0 && (
          <CommandGroup heading={t("palette.clients")}>
            {results.clients.map((c) => (
              <CommandItem key={c.id} value={`client-${c.id}`} onSelect={() => go(`/clients/${c.id}`)}>
                <User />
                <span className="flex-1 truncate">{c.fullName}</span>
                <span className="num flex items-center gap-1 text-xs text-muted-foreground">
                  {c.isWhatsapp && <WhatsAppIcon className="size-3.5 text-whatsapp" />}
                  {formatPhone(c.phone)}
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.orders.length > 0 && (
          <CommandGroup heading={t("palette.orders")}>
            {results.orders.map((v) => (
              <CommandItem key={v.order.id} value={`order-${v.order.id}`} onSelect={() => go(`/orders/${v.order.id}`)}>
                <FileText />
                <span className="min-w-0 flex-1">
                  <span className="block truncate">{v.client?.fullName}</span>
                  <span className="block text-xs text-muted-foreground">
                    {t("palette.orderLine", { number: v.order.invoiceNumber, location: labels.location(v.order.locationId) })}
                  </span>
                </span>
                <StatusBadge status={v.order.status} />
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {results.pages.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading={t("palette.pages")}>
              {results.pages.map((p) => {
                const Icon = NAV_ICONS[p.key];
                return (
                  <CommandItem key={p.key} value={`page-${p.key}`} onSelect={() => go(p.href)}>
                    <Icon />
                    {t(`nav.${p.key}`)}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </Command>
  );
}
