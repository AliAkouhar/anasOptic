"use client";

import { ArrowDown, ArrowRight, ArrowRightLeft, Loader2, Minus, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DataTable, type Column } from "@/components/shared/data-table";
import { useFeedback } from "@/components/shared/feedback";
import { PageHeader } from "@/components/shared/page";
import { ProductCombobox } from "@/components/shared/product-combobox";
import { useActiveLocations, useFormat, useLabels, useSimulatedLoading } from "@/data/hooks";
import { stockIndex } from "@/data/indexes";
import { stockRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { shortLocationName } from "@/lib/format";
import { stockKey } from "@/lib/calculations";
import type { ID, Transfer } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Line {
  key: number;
  productId?: ID;
  qty: number;
}

let seq = 0;

export function TransfersPage() {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const feedback = useFeedback();
  const search = useSearchParams();
  const loading = useSimulatedLoading();
  const locations = useActiveLocations();
  const products = useDb((db) => db.products);
  const movements = useDb((db) => db.stockMovements);
  const transfers = useDb((db) => db.transfers);
  const lab = locations.find((l) => l.type === "lab");
  const [from, setFrom] = useState<ID>(search.get("from") ?? lab?.id ?? locations[0]?.id ?? "");
  const [to, setTo] = useState<ID>(() => locations.find((l) => l.id !== (search.get("from") ?? lab?.id) && l.type === "store")?.id ?? "");
  const [lines, setLines] = useState<Line[]>(() => [{ key: seq++, productId: search.get("product") ?? undefined, qty: 1 }]);
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);
  const [touched, setTouched] = useState(false);

  const levels = stockIndex(movements);
  const available = (productId: ID, loc: ID) => levels.get(stockKey(productId, loc)) ?? 0;
  const sourceProducts = products.filter((p) => p.isActive && (levels.get(stockKey(p.id, from)) ?? 0) > 0);

  // Aggregate requested quantity per product (a product can appear once per line).
  const requested = new Map<ID, number>();
  for (const l of lines) if (l.productId && l.qty > 0) requested.set(l.productId, (requested.get(l.productId) ?? 0) + l.qty);
  const shortages = [...requested].filter(([pid, qty]) => qty > available(pid, from));
  const sameLocation = from === to;
  const valid = requested.size > 0 && shortages.length === 0 && !sameLocation && !!to;
  const chosen = new Set(lines.map((l) => l.productId).filter(Boolean) as ID[]);

  const submit = async () => {
    setTouched(true);
    if (!valid) return;
    setPending(true);
    try {
      const { transfer, undo } = await stockRepo.transfer({
        fromLocationId: from,
        toLocationId: to,
        items: [...requested].map(([productId, qty]) => ({ productId, qty })),
        note,
      });
      const count = transfer.items.reduce((s, it) => s + it.qty, 0);
      feedback.success(t("transfers.done", { count, from: labels.location(from), to: labels.location(to) }), { undo });
      setLines([{ key: seq++, qty: 1 }]);
      setNote("");
      setTouched(false);
    } catch (e) {
      feedback.error(e);
    } finally {
      setPending(false);
    }
  };

  const history = useMemo(() => [...transfers].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [transfers]);
  const columns: Column<Transfer>[] = [
    { id: "date", header: t("transfers.columns.date"), sortValue: (tr) => tr.createdAt, cell: (tr) => <span className="num whitespace-nowrap text-muted-foreground">{f.dateTime(tr.createdAt)}</span> },
    {
      id: "route",
      header: t("transfers.columns.route"),
      cell: (tr) => (
        <span className="flex items-center gap-1.5 whitespace-nowrap font-medium">
          {shortLocationName(labels.location(tr.fromLocationId))}
          <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
          {shortLocationName(labels.location(tr.toLocationId))}
        </span>
      ),
    },
    {
      id: "items",
      header: t("transfers.columns.items"),
      cell: (tr) => (
        <span className="text-muted-foreground">
          {tr.items.map((it) => `${labels.product(it.productId)} ×${it.qty}`).join(", ")}
          {tr.note && <span className="block text-xs italic">{tr.note}</span>}
        </span>
      ),
    },
    { id: "user", header: t("transfers.columns.user"), hideBelow: "lg", cell: (tr) => labels.user(tr.userId) },
  ];

  const locationSelect = (id: string, value: ID, onChange: (v: ID) => void) => (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="w-full">
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
  );

  return (
    <>
      <PageHeader backHref="/stock" title={t("transfers.title")} description={t("transfers.description")} />
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <Card>
          <CardHeader>
            <CardTitle>{t("transfers.newTransfer")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid items-end gap-3 sm:grid-cols-[1fr_auto_1fr]">
              <div className="space-y-2">
                <Label htmlFor="tr-from">{t("transfers.from")}</Label>
                {locationSelect("tr-from", from, (v) => {
                  setFrom(v);
                  setLines((ls) => ls.map((l) => ({ ...l, productId: l.productId && available(l.productId, v) > 0 ? l.productId : undefined })));
                })}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="mx-auto"
                onClick={() => {
                  setFrom(to);
                  setTo(from);
                }}
                aria-label={t("transfers.swap")}
                title={t("transfers.swap")}
              >
                <ArrowRightLeft className="hidden sm:block" />
                <ArrowDown className="sm:hidden" />
              </Button>
              <div className="space-y-2">
                <Label htmlFor="tr-to">{t("transfers.to")}</Label>
                {locationSelect("tr-to", to, setTo)}
              </div>
            </div>
            {sameLocation && <p className="text-sm text-destructive">{t("transfers.sameLocation")}</p>}

            <div className="space-y-3">
              <Label>{t("transfers.products")}</Label>
              {lines.map((line, i) => {
                const avail = line.productId ? available(line.productId, from) : 0;
                const over = !!line.productId && (requested.get(line.productId) ?? 0) > avail;
                return (
                  <div key={line.key} className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="min-w-0 flex-[1_1_16rem]">
                        <ProductCombobox
                          id={`tr-product-${i}`}
                          products={sourceProducts}
                          value={line.productId}
                          onChange={(pid) => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, productId: pid } : l)))}
                          placeholder={t("transfers.chooseProduct")}
                          emptyText={t("common.noResults")}
                          hint={(p) => t("transfers.available", { count: available(p.id, from) })}
                          disabledIds={chosen}
                          invalid={touched && !line.productId && lines.length === 1}
                        />
                      </div>
                      <div className="flex items-center gap-1">
                        <Button type="button" variant="outline" size="icon" onClick={() => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, qty: Math.max(1, l.qty - 1) } : l)))} aria-label="−1">
                          <Minus />
                        </Button>
                        <Input
                          inputMode="numeric"
                          aria-label={t("transfers.qty")}
                          className={cn("num w-16 text-center font-semibold", over && "border-destructive")}
                          value={line.qty}
                          onChange={(e) => {
                            const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
                            setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, qty: Number.isNaN(n) ? 0 : n } : l)));
                          }}
                        />
                        <Button type="button" variant="outline" size="icon" onClick={() => setLines((ls) => ls.map((l) => (l.key === line.key ? { ...l, qty: l.qty + 1 } : l)))} aria-label="+1">
                          <Plus />
                        </Button>
                      </div>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setLines((ls) => (ls.length > 1 ? ls.filter((l) => l.key !== line.key) : [{ key: seq++, qty: 1 }]))}
                        aria-label={t("transfers.removeLine")}
                      >
                        <Trash2 />
                      </Button>
                    </div>
                    {over && (
                      <p className="text-sm text-destructive" role="alert">
                        {t("transfers.notEnough", { available: avail, location: labels.location(from) })}
                      </p>
                    )}
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="sm" onClick={() => setLines((ls) => [...ls, { key: seq++, qty: 1 }])}>
                <Plus />
                {t("transfers.addProduct")}
              </Button>
            </div>
            <div className="space-y-2">
              <Label htmlFor="tr-note" className="text-muted-foreground">
                {t("transfers.note")}
              </Label>
              <Input id="tr-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder={t("transfers.notePlaceholder")} />
            </div>
          </CardContent>
        </Card>

        <Card className="self-start lg:sticky lg:top-24">
          <CardHeader>
            <CardTitle>{t("transfers.preview")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {requested.size === 0 ? (
              <p className="text-sm text-muted-foreground">{t("transfers.previewEmpty")}</p>
            ) : (
              <ul className="space-y-3" aria-live="polite">
                {[...requested].map(([pid, qty]) => {
                  const a = available(pid, from);
                  const b = available(pid, to);
                  return (
                    <li key={pid} className="rounded-xl border p-3">
                      <p className="truncate text-sm font-medium">{labels.product(pid)}</p>
                      <p className="num mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
                        <span className="text-muted-foreground">{shortLocationName(labels.location(from))} :</span>
                        <span>{a}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        <span className={cn("font-bold", a - qty < 0 ? "text-destructive" : "text-attention-text")}>{a - qty}</span>
                        <span className="text-muted-foreground" aria-hidden="true">
                          ·
                        </span>
                        <span className="text-muted-foreground">{shortLocationName(labels.location(to))} :</span>
                        <span>{b}</span>
                        <ArrowRight className="size-3.5 text-muted-foreground" aria-hidden="true" />
                        <span className="font-bold text-success-text">{b + qty}</span>
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
            <Button size="lg" className="w-full" onClick={submit} disabled={pending || (touched && !valid)}>
              {pending && <Loader2 className="animate-spin" />}
              {t("transfers.confirm")}
            </Button>
          </CardContent>
        </Card>
      </div>

      <Card className="mt-6 py-0">
        <CardHeader className="pt-5">
          <CardTitle>{t("transfers.history")}</CardTitle>
        </CardHeader>
        <DataTable
          rows={history}
          columns={columns}
          rowKey={(tr) => tr.id}
          initialSort={{ id: "date", desc: true }}
          pageSize={10}
          loading={loading}
          empty={<p className="px-5 pb-5 text-sm text-muted-foreground">{t("transfers.historyEmpty")}</p>}
          mobileCard={(tr) => (
            <div className="px-4 py-3">
              <p className="flex items-center gap-1.5 font-medium">
                {shortLocationName(labels.location(tr.fromLocationId))}
                <ArrowRight className="size-3.5" aria-hidden="true" />
                {shortLocationName(labels.location(tr.toLocationId))}
                <span className="num ml-auto text-xs font-normal text-muted-foreground">{f.date(tr.createdAt)}</span>
              </p>
              <p className="text-sm text-muted-foreground">{tr.items.map((it) => `${labels.product(it.productId)} ×${it.qty}`).join(", ")}</p>
            </div>
          )}
        />
      </Card>
    </>
  );
}
