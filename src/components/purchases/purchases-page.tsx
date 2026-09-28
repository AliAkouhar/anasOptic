"use client";

import { Loader2, MoreHorizontal, PackageCheck, Pencil, Phone, Plus, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { DataTable, type Column } from "@/components/shared/data-table";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { EmptyState, PageHeader } from "@/components/shared/page";
import { useActiveLocation, useFormat, useLabels, useOptionList, useSimulatedLoading } from "@/data/hooks";
import { stockIndex } from "@/data/indexes";
import { purchasesRepo } from "@/data/repositories";
import { getDb, useDb } from "@/data/store";
import { stockKey } from "@/lib/calculations";
import { formatPhone, shortLocationName } from "@/lib/format";
import type { ID, PurchaseOrder, PurchaseOrderStatus, Supplier } from "@/lib/types";
import { cn } from "@/lib/utils";
import { PoFormDialog, ReceivedDialog } from "./po-dialogs";

const PO_BADGE: Record<PurchaseOrderStatus, string> = {
  draft: "bg-slate-100 text-slate-700 ring-slate-500/15 dark:bg-slate-500/15 dark:text-slate-300",
  ordered: "bg-blue-50 text-blue-700 ring-blue-600/15 dark:bg-blue-500/15 dark:text-blue-300",
  received: "bg-green-50 text-green-700 ring-green-600/15 dark:bg-green-500/15 dark:text-green-300",
};

function PoStatus({ status }: { status: PurchaseOrderStatus }) {
  const t = useTranslations("purchases.statuses");
  return <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium ring-1 ring-inset", PO_BADGE[status])}>{t(status)}</span>;
}

const poTotal = (po: PurchaseOrder) => po.items.reduce((s, it) => s + it.qty * it.unitCost, 0);

export function PurchasesPage() {
  const t = useTranslations();
  const [tab, setTab] = useState("orders");
  const [formFor, setFormFor] = useState<{ po?: PurchaseOrder } | null>(null);
  return (
    <>
      <PageHeader
        title={t("purchases.title")}
        description={t("purchases.description")}
        actions={
          tab === "orders" && (
            <Button onClick={() => setFormFor({})}>
              <Plus />
              {t("purchases.newPo")}
            </Button>
          )
        }
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-5">
          <TabsTrigger value="orders" className="px-4">
            {t("purchases.tabs.orders")}
          </TabsTrigger>
          <TabsTrigger value="suppliers" className="px-4">
            {t("purchases.tabs.suppliers")}
          </TabsTrigger>
        </TabsList>
        <TabsContent value="orders">
          <PurchaseOrders onEdit={(po) => setFormFor({ po })} onCreate={() => setFormFor({})} />
        </TabsContent>
        <TabsContent value="suppliers">
          <Suppliers />
        </TabsContent>
      </Tabs>
      {formFor && <PoFormDialog key={formFor.po?.id ?? "new"} open onOpenChange={(o) => !o && setFormFor(null)} po={formFor.po} />}
    </>
  );
}

function PurchaseOrders({ onEdit, onCreate }: { onEdit: (po: PurchaseOrder) => void; onCreate: () => void }) {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const feedback = useFeedback();
  const loading = useSimulatedLoading();
  const [active] = useActiveLocation();
  const orders = useDb((db) => db.purchaseOrders);
  const suppliers = useDb((db) => db.suppliers);
  const [status, setStatus] = useState<PurchaseOrderStatus | "all">("all");
  const [receiving, setReceiving] = useState<ID | null>(null);
  const [received, setReceived] = useState<{ po: PurchaseOrder; before: Record<ID, number> } | null>(null);
  const [deleting, setDeleting] = useState<PurchaseOrder | null>(null);

  const rows = useMemo(
    () => orders.filter((po) => (status === "all" || po.status === status) && (active === "all" || po.locationId === active)),
    [orders, status, active],
  );
  const supplierName = (id: ID) => suppliers.find((s) => s.id === id)?.name ?? "—";

  const receive = async (po: PurchaseOrder) => {
    setReceiving(po.id);
    const levels = stockIndex(getDb().stockMovements);
    const before = Object.fromEntries(po.items.map((it) => [it.productId, levels.get(stockKey(it.productId, po.locationId)) ?? 0]));
    try {
      await purchasesRepo.markReceived(po.id);
      setReceived({ po, before });
    } catch (e) {
      feedback.error(e);
    } finally {
      setReceiving(null);
    }
  };

  const columns: Column<PurchaseOrder>[] = [
    { id: "ref", header: t("purchases.columns.reference"), sortValue: (po) => po.reference, cell: (po) => <span className="num font-semibold">{po.reference}</span> },
    { id: "supplier", header: t("purchases.columns.supplier"), sortValue: (po) => supplierName(po.supplierId), cell: (po) => supplierName(po.supplierId) },
    { id: "location", header: t("purchases.columns.location"), hideBelow: "lg", cell: (po) => <span className="text-muted-foreground">{shortLocationName(labels.location(po.locationId))}</span> },
    { id: "status", header: t("purchases.columns.status"), sortValue: (po) => ["draft", "ordered", "received"].indexOf(po.status), cell: (po) => <PoStatus status={po.status} /> },
    { id: "items", header: t("purchases.columns.items"), align: "right", hideBelow: "lg", cell: (po) => <span className="num">{po.items.reduce((s, it) => s + it.qty, 0)}</span> },
    { id: "total", header: t("purchases.columns.total"), align: "right", sortValue: poTotal, cell: (po) => <span className="num font-medium">{f.money(poTotal(po))}</span> },
    {
      id: "date",
      header: t("purchases.columns.date"),
      sortValue: (po) => po.receivedAt ?? po.orderedAt ?? po.createdAt,
      cell: (po) => <span className="num whitespace-nowrap text-muted-foreground">{f.date(po.receivedAt ?? po.orderedAt ?? po.createdAt)}</span>,
    },
    {
      id: "actions",
      header: <span className="sr-only">{t("common.actions")}</span>,
      align: "right",
      cell: (po) => <PoActions po={po} busy={receiving === po.id} onReceive={() => receive(po)} onEdit={() => onEdit(po)} onDelete={() => setDeleting(po)} />,
    },
  ];

  return (
    <>
      <ChoiceChips
        className="mb-4"
        label={t("purchases.columns.status")}
        value={status}
        onChange={(v) => setStatus(v as PurchaseOrderStatus | "all")}
        options={[
          { value: "all", label: t("purchases.allStatuses") },
          ...(["draft", "ordered", "received"] as const).map((s) => ({ value: s, label: `${t(`purchases.statuses.${s}`)} · ${orders.filter((po) => po.status === s).length}` })),
        ]}
      />
      <Card className="py-0">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(po) => po.id}
          initialSort={{ id: "date", desc: true }}
          loading={loading}
          caption={t("purchases.tabs.orders")}
          empty={
            <EmptyState
              illustration="box"
              title={t("purchases.empty")}
              body={t("purchases.emptyBody")}
              action={
                <Button onClick={onCreate}>
                  <Plus />
                  {t("purchases.newPo")}
                </Button>
              }
            />
          }
          mobileCard={(po) => (
            <div className="flex items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="num font-semibold">{po.reference}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {supplierName(po.supplierId)} · {shortLocationName(labels.location(po.locationId))}
                </p>
                <div className="mt-1 flex items-center gap-2">
                  <PoStatus status={po.status} />
                  <span className="num text-sm font-medium">{f.money(poTotal(po))}</span>
                </div>
              </div>
              <PoActions po={po} busy={receiving === po.id} onReceive={() => receive(po)} onEdit={() => onEdit(po)} onDelete={() => setDeleting(po)} />
            </div>
          )}
        />
      </Card>
      <ReceivedDialog result={received} onClose={() => setReceived(null)} />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("purchases.deleteTitle")}
        description={t("purchases.deleteBody", { reference: deleting?.reference ?? "" })}
        confirmLabel={t("purchases.delete")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await purchasesRepo.remove(deleting.id);
            feedback.success(t("purchases.deleted"));
          } catch (e) {
            feedback.error(e);
          }
        }}
      />
    </>
  );
}

function PoActions({ po, busy, onReceive, onEdit, onDelete }: { po: PurchaseOrder; busy: boolean; onReceive: () => void; onEdit: () => void; onDelete: () => void }) {
  const t = useTranslations("purchases");
  const feedback = useFeedback();
  if (po.status === "received") return null;
  return (
    <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
      <Button size="sm" variant="success" onClick={onReceive} disabled={busy} aria-label={t("markReceived")} title={t("markReceived")}>
        {busy ? <Loader2 className="animate-spin" /> : <PackageCheck />}
        <span className="hidden xl:inline">{t("markReceived")}</span>
      </Button>
      {po.status === "draft" && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-sm" aria-label={t("edit")}>
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem
              onSelect={async () => {
                try {
                  const { undo } = await purchasesRepo.markOrdered(po.id);
                  feedback.success(t("ordered", { reference: po.reference }), { undo });
                } catch (e) {
                  feedback.error(e);
                }
              }}
            >
              <Send />
              {t("markOrdered")}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              {t("edit")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onSelect={onDelete}>
              <Trash2 />
              {t("delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}

function Suppliers() {
  const t = useTranslations("purchases.suppliers");
  const tc = useTranslations("common");
  const labels = useLabels();
  const feedback = useFeedback();
  const suppliers = useDb((db) => db.suppliers);
  const orders = useDb((db) => db.purchaseOrders);
  const [editing, setEditing] = useState<Supplier | "new" | null>(null);
  const [deleting, setDeleting] = useState<Supplier | null>(null);
  return (
    <>
      <div className="mb-4 flex justify-end">
        <Button variant="outline" onClick={() => setEditing("new")}>
          <Plus />
          {t("add")}
        </Button>
      </div>
      {suppliers.length === 0 ? (
        <EmptyState illustration="box" title={t("empty")} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {suppliers.map((s) => {
            const count = orders.filter((po) => po.supplierId === s.id).length;
            return (
              <li key={s.id}>
                <Card className="h-full">
                  <CardContent className="space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{s.name}</p>
                        <p className="text-sm text-muted-foreground">{s.categoryId ? labels.option(s.categoryId) : t("noCategory")}</p>
                      </div>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon-sm" aria-label={`${t("editTitle")} ${s.name}`}>
                            <MoreHorizontal />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onSelect={() => setEditing(s)}>
                            <Pencil />
                            {t("editTitle")}
                          </DropdownMenuItem>
                          <DropdownMenuItem variant="destructive" disabled={count > 0} onSelect={() => setDeleting(s)}>
                            <Trash2 />
                            {tc("delete")}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <a href={`tel:${s.phone}`} className="num flex items-center gap-1.5 text-primary hover:underline">
                        <Phone className="size-4" aria-hidden="true" />
                        {formatPhone(s.phone)}
                      </a>
                      <span className="text-muted-foreground">{t("orders", { count })}</span>
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <SupplierDialog key={editing === "new" ? "new" : editing.id} supplier={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("deleteTitle", { name: deleting?.name ?? "" })}
        description={t("deleteBody")}
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await purchasesRepo.removeSupplier(deleting.id);
            feedback.success(t("deleted"));
          } catch (e) {
            feedback.error(e);
          }
        }}
      />
    </>
  );
}

function SupplierDialog({ supplier, onClose }: { supplier?: Supplier; onClose: () => void }) {
  const t = useTranslations("purchases.suppliers");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const feedback = useFeedback();
  const categories = useOptionList("supplier_category");
  const labels = useLabels();
  const [name, setName] = useState(supplier?.name ?? "");
  const [phone, setPhone] = useState(supplier?.phone ?? "");
  const [categoryId, setCategoryId] = useState<string>(supplier?.categoryId ?? "none");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const save = async () => {
    setTouched(true);
    if (!name.trim()) return;
    setPending(true);
    try {
      await purchasesRepo.saveSupplier({ id: supplier?.id, name, phone, categoryId: categoryId === "none" ? undefined : categoryId });
      feedback.success(t("saved"));
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
      title={supplier ? t("editTitle") : t("createTitle")}
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
          <Label htmlFor="sup-name">{t("name")}</Label>
          <Input id="sup-name" value={name} onChange={(e) => setName(e.target.value)} aria-invalid={touched && !name.trim()} />
          {touched && !name.trim() && <p className="text-sm text-destructive">{te("name_required")}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="sup-phone">{t("phone")}</Label>
          <Input id="sup-phone" type="tel" inputMode="tel" className="num" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="sup-cat">{t("category")}</Label>
          <Select value={categoryId} onValueChange={setCategoryId}>
            <SelectTrigger id="sup-cat" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">{t("noCategory")}</SelectItem>
              {categories.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {labels.option(c.id)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ResponsiveDialog>
  );
}
