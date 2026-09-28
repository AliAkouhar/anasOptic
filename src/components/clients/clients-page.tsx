"use client";

import { Search, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { SegmentBadge, WhatsAppIcon } from "@/components/shared/badges";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { DataTable, type Column } from "@/components/shared/data-table";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { useCan, useFormat, useLabels, useOrderScope, useRequiredAuth, useSimulatedLoading } from "@/data/hooks";
import { clientStats, visibleClientIds, type ClientStats } from "@/data/indexes";
import { useDbStore } from "@/data/store";
import { Link, useRouter } from "@/i18n/navigation";
import { formatPhone, initials, normalizePhone } from "@/lib/format";
import type { Client, ClientSegment } from "@/lib/types";
import { ClientFormDialog } from "./client-form-dialog";

type Row = { client: Client; stats: ClientStats };

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/** Clients the user may see, with stats computed within their scope. */
export function useVisibleClients(): Row[] {
  const db = useDbStore((s) => s.db)!;
  const scope = useOrderScope();
  return useMemo(() => {
    const ids = scope === "none" ? new Set<string>() : visibleClientIds(db, scope);
    const stats = clientStats(db, scope === "none" ? [] : scope);
    return db.clients.filter((c) => !ids || ids.has(c.id)).map((client) => ({ client, stats: stats.get(client.id)! }));
  }, [db, scope]);
}

export function ClientsPage() {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const can = useCan();
  const auth = useRequiredAuth();
  const router = useRouter();
  const loading = useSimulatedLoading();
  const rows = useVisibleClients();
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<ClientSegment | "all">("all");
  const [createOpen, setCreateOpen] = useState(false);

  const counts = useMemo(() => {
    const c: Record<ClientSegment, number> = { new: 0, regular: 0, loyal: 0 };
    for (const r of rows) c[r.stats.segment]++;
    return c;
  }, [rows]);

  const filtered = useMemo(() => {
    const query = fold(q.trim());
    const digits = normalizePhone(q).replace(/^0/, "");
    return rows.filter(
      (r) =>
        (segment === "all" || r.stats.segment === segment) &&
        (!query || fold(r.client.fullName).includes(query) || (digits.length >= 3 && normalizePhone(r.client.phone).includes(digits))),
    );
  }, [rows, q, segment]);

  const columns: Column<Row>[] = [
    {
      id: "name",
      header: t("clients.columns.name"),
      sortValue: (r) => r.client.fullName,
      cell: (r) => (
        <Link href={`/clients/${r.client.id}`} className="flex items-center gap-3 font-medium hover:underline" onClick={(e) => e.stopPropagation()}>
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-xs font-semibold text-accent-foreground">{initials(r.client.fullName)}</span>
          {r.client.fullName}
        </Link>
      ),
    },
    {
      id: "phone",
      header: t("clients.columns.phone"),
      cell: (r) => (
        <span className="num flex items-center gap-1.5 whitespace-nowrap text-muted-foreground">
          {r.client.isWhatsapp ? <WhatsAppIcon className="text-whatsapp" /> : <span className="size-4" />}
          {formatPhone(r.client.phone)}
        </span>
      ),
    },
    { id: "orders", header: t("clients.columns.orders"), align: "right", sortValue: (r) => r.stats.orderCount, cell: (r) => <span className="num">{r.stats.orderCount}</span> },
    { id: "spent", header: t("clients.columns.spent"), align: "right", sortValue: (r) => r.stats.totalSpent, cell: (r) => <span className="num font-medium">{f.money(r.stats.totalSpent)}</span> },
    {
      id: "last",
      header: t("clients.columns.lastVisit"),
      sortValue: (r) => r.stats.lastVisit ?? "",
      hideBelow: "lg",
      cell: (r) => <span className="num text-muted-foreground">{r.stats.lastVisit ? f.date(r.stats.lastVisit) : t("clients.never")}</span>,
    },
    { id: "segment", header: t("clients.columns.segment"), sortValue: (r) => ["new", "regular", "loyal"].indexOf(r.stats.segment), cell: (r) => <SegmentBadge segment={r.stats.segment} /> },
  ];

  return (
    <>
      <PageHeader
        title={t("clients.title")}
        description={
          auth.user.locationId && !can("orders.view_all") ? t("clients.descriptionScoped", { location: labels.location(auth.user.locationId) }) : t("clients.description")
        }
        actions={
          <Button onClick={() => setCreateOpen(true)}>
            <UserPlus />
            {t("clients.newClient")}
          </Button>
        }
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-80">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("clients.searchPlaceholder")} aria-label={t("clients.searchPlaceholder")} className="pl-9" />
        </div>
        <ChoiceChips
          label={t("clients.columns.segment")}
          value={segment}
          onChange={(v) => setSegment(v as ClientSegment | "all")}
          options={[
            { value: "all", label: `${t("clients.all")} · ${rows.length}` },
            { value: "new", label: `${t("segment.new")} · ${counts.new}` },
            { value: "regular", label: `${t("segment.regular")} · ${counts.regular}` },
            { value: "loyal", label: `${t("segment.loyal")} · ${counts.loyal}` },
          ]}
        />
      </div>
      <Card className="py-0">
        <DataTable
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.client.id}
          initialSort={{ id: "last", desc: true }}
          onRowClick={(r) => router.push(`/clients/${r.client.id}`)}
          loading={loading}
          caption={t("clients.title")}
          empty={
            rows.length === 0 ? (
              <EmptyState illustration="clients" title={t("clients.empty")} body={t("clients.emptyBody")} />
            ) : (
              <EmptyState illustration="search" title={t("common.noResults")} body={t("common.noResultsBody")} />
            )
          }
          mobileCard={(r) => (
            <Link href={`/clients/${r.client.id}`} className="flex items-center gap-3 px-4 py-3 active:bg-muted">
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-accent-foreground">{initials(r.client.fullName)}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.client.fullName}</span>
                <span className="num flex items-center gap-1 text-xs text-muted-foreground">
                  {r.client.isWhatsapp && <WhatsAppIcon className="size-3.5 text-whatsapp" />}
                  {formatPhone(r.client.phone)} · {t("wizard.ordersCount", { count: r.stats.orderCount })}
                </span>
              </span>
              <SegmentBadge segment={r.stats.segment} />
            </Link>
          )}
        />
      </Card>
      <ClientFormDialog open={createOpen} onOpenChange={setCreateOpen} onCreated={(c) => router.push(`/clients/${c.id}`)} />
    </>
  );
}
