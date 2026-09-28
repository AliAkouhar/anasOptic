"use client";

import { ArrowLeftRight, History, Search, SlidersHorizontal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Toggle } from "@/components/ui/toggle";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { DataTable, type Column } from "@/components/shared/data-table";
import { useFeedback } from "@/components/shared/feedback";
import { EmptyState, PageHeader, Stat } from "@/components/shared/page";
import { useActiveLocation, useActiveLocations, useCan, useFormat, useLabels, useRequiredAuth, useSimulatedLoading } from "@/data/hooks";
import { stockIndex, thresholdIndex } from "@/data/indexes";
import { stockRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { Link } from "@/i18n/navigation";
import { stockKey, stockState, type StockState } from "@/lib/calculations";
import type { ID, Product, ProductKind } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AdjustDialog, MovementsDrawer } from "./stock-dialogs";

interface Row {
  product: Product;
  label: string;
  qty: number;
  min: number | undefined;
  state: StockState;
}

const QTY_TONE: Record<StockState, string> = {
  out: "bg-destructive/10 text-destructive",
  low: "bg-destructive/10 text-destructive",
  near: "bg-amber-100 text-amber-800 dark:bg-amber-500/15 dark:text-amber-300",
  ok: "bg-muted text-foreground",
};

function fold(s: string) {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

function ThresholdCell({ productId, locationId, value, editable, label }: { productId: ID; locationId: ID; value: number | undefined; editable: boolean; label: string }) {
  const t = useTranslations("stock");
  const feedback = useFeedback();
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(String(value ?? ""));
  if (!editable) return <span className="num text-muted-foreground">{value ?? "—"}</span>;
  if (!editing) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setText(String(value ?? ""));
          setEditing(true);
        }}
        className="num min-w-10 rounded-md border border-dashed border-transparent px-2 py-1 text-muted-foreground hover:border-border hover:text-foreground"
        aria-label={t("thresholdEdit", { product: label })}
      >
        {value ?? "—"}
      </button>
    );
  }
  const save = async () => {
    setEditing(false);
    const n = parseInt(text, 10);
    if (Number.isNaN(n) || n === value) return;
    try {
      const { undo } = await stockRepo.setThreshold(productId, locationId, Math.max(0, n));
      feedback.success(t("thresholdSaved", { qty: Math.max(0, n) }), { undo });
    } catch (e) {
      feedback.error(e);
    }
  };
  return (
    <Input
      autoFocus
      inputMode="numeric"
      className="num h-8 w-16 text-center pointer-coarse:h-10"
      value={text}
      onClick={(e) => e.stopPropagation()}
      onChange={(e) => setText(e.target.value.replace(/\D/g, ""))}
      onBlur={() => void save()}
      onKeyDown={(e) => {
        if (e.key === "Enter") void save();
        if (e.key === "Escape") setEditing(false);
      }}
      aria-label={t("thresholdEdit", { product: label })}
    />
  );
}

export function StockPage() {
  const t = useTranslations();
  const f = useFormat();
  const labels = useLabels();
  const can = useCan();
  const auth = useRequiredAuth();
  const search = useSearchParams();
  const loading = useSimulatedLoading();
  const [activeLocation] = useActiveLocation();
  const locations = useActiveLocations();
  const products = useDb((db) => db.products);
  const movements = useDb((db) => db.stockMovements);
  const thresholds = useDb((db) => db.stockThresholds);
  const seeAll = can("stock.view_all");
  const tabs = seeAll ? [...locations].sort((a, b) => Number(a.type === "lab") - Number(b.type === "lab")) : locations.filter((l) => l.id === auth.user.locationId);
  const requested = search.get("location");
  const initial =
    (requested && tabs.find((l) => l.id === requested)?.id) || tabs.find((l) => l.id === activeLocation)?.id || tabs[0]?.id || "";
  const [locationId, setLocationId] = useState(initial);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ProductKind | "all">("all");
  const [lowOnly, setLowOnly] = useState(false);
  const [drawerProduct, setDrawerProduct] = useState<ID | null>(search.get("product"));
  const [adjustTarget, setAdjustTarget] = useState<{ productId: ID; locationId: ID } | null>(null);

  // Follow the topbar selector when the admin changes it (the tabs stay free to switch afterwards).
  const [followed, setFollowed] = useState(activeLocation);
  if (activeLocation !== followed) {
    setFollowed(activeLocation);
    if (seeAll && activeLocation !== "all" && tabs.some((l) => l.id === activeLocation)) setLocationId(activeLocation);
  }

  const rows = useMemo<Row[]>(() => {
    const levels = stockIndex(movements);
    const mins = thresholdIndex(thresholds);
    const tracked = new Set<ID>();
    for (const th of thresholds) if (th.locationId === locationId) tracked.add(th.productId);
    for (const m of movements) if (m.locationId === locationId) tracked.add(m.productId);
    return products
      .filter((p) => tracked.has(p.id))
      .map((p) => {
        const k = stockKey(p.id, locationId);
        const qty = levels.get(k) ?? 0;
        const min = mins.get(k);
        return { product: p, label: labels.product(p.id), qty, min, state: stockState(qty, min ?? 0) };
      });
  }, [products, movements, thresholds, locationId, labels]);

  const filtered = useMemo(() => {
    const query = fold(q.trim());
    return rows.filter(
      (r) =>
        (kind === "all" || r.product.kind === kind) &&
        (!lowOnly || r.state === "out" || r.state === "low") &&
        (!query || fold(r.label).includes(query) || fold(labels.option(r.product.categoryId)).includes(query)),
    );
  }, [rows, kind, lowOnly, q, labels]);

  const totalValue = rows.reduce((s, r) => s + Math.max(0, r.qty) * r.product.purchasePrice, 0);
  const below = rows.filter((r) => r.state === "out" || r.state === "low").length;

  const columns: Column<Row>[] = [
    {
      id: "product",
      header: t("stock.columns.product"),
      sortValue: (r) => r.label,
      cell: (r) => (
        <div className="min-w-0">
          <p className="truncate font-medium">{r.product.name}</p>
          <p className="text-xs text-muted-foreground">{labels.option(r.product.brandId)}</p>
        </div>
      ),
    },
    { id: "category", header: t("stock.columns.category"), sortValue: (r) => labels.option(r.product.categoryId), hideBelow: "lg", cell: (r) => <span className="text-muted-foreground">{labels.option(r.product.categoryId)}</span> },
    {
      id: "qty",
      header: t("stock.columns.qty"),
      align: "right",
      sortValue: (r) => r.qty,
      cell: (r) => (
        <span className={cn("num inline-flex h-7 min-w-10 items-center justify-center rounded-lg px-2 font-bold", QTY_TONE[r.state])} title={t(`stock.states.${r.state}`)}>
          {r.qty}
          <span className="sr-only"> ({t(`stock.states.${r.state}`)})</span>
        </span>
      ),
    },
    {
      id: "min",
      header: t("stock.columns.threshold"),
      align: "center",
      sortValue: (r) => r.min ?? -1,
      cell: (r) => <ThresholdCell productId={r.product.id} locationId={locationId} value={r.min} editable={can("stock.adjust")} label={r.label} />,
    },
    ...(seeAll
      ? [
          {
            id: "value",
            header: t("stock.columns.value"),
            align: "right" as const,
            hideBelow: "lg" as const,
            sortValue: (r: Row) => r.qty * r.product.purchasePrice,
            cell: (r: Row) => <span className="num text-muted-foreground">{f.money(Math.max(0, r.qty) * r.product.purchasePrice)}</span>,
          },
        ]
      : []),
    {
      id: "actions",
      header: <span className="sr-only">{t("common.actions")}</span>,
      align: "right",
      cell: (r) => (
        <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          <Button variant="ghost" size="icon-sm" onClick={() => setDrawerProduct(r.product.id)} aria-label={`${t("stock.history")} · ${r.label}`} title={t("stock.history")}>
            <History />
          </Button>
          {can("stock.adjust") && (
            <Button variant="ghost" size="icon-sm" onClick={() => setAdjustTarget({ productId: r.product.id, locationId })} aria-label={`${t("stock.adjust")} · ${r.label}`} title={t("stock.adjust")}>
              <SlidersHorizontal />
            </Button>
          )}
          {can("stock.transfer") && (
            <Button asChild variant="ghost" size="icon-sm" aria-label={`${t("stock.transfer")} · ${r.label}`} title={t("stock.transfer")}>
              <Link href={`/stock/transfers?from=${locationId}&product=${r.product.id}`}>
                <ArrowLeftRight />
              </Link>
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title={t("stock.title")}
        description={seeAll ? t("stock.description") : t("stock.descriptionScoped", { location: labels.location(auth.user.locationId ?? undefined) })}
        actions={
          can("stock.transfer") && (
            <Button asChild variant="outline">
              <Link href="/stock/transfers">
                <ArrowLeftRight />
                {t("nav.transfers")}
              </Link>
            </Button>
          )
        }
      />

      {tabs.length > 1 && (
        <Tabs value={locationId} onValueChange={setLocationId} className="mb-4">
          <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
            <TabsList>
              {tabs.map((l) => (
                <TabsTrigger key={l.id} value={l.id} className="px-4">
                  {l.name}
                </TabsTrigger>
              ))}
            </TabsList>
          </div>
        </Tabs>
      )}

      <Card className="mb-5">
        <CardContent className={cn("grid gap-4", seeAll ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2")}>
          <Stat label={t("stock.tracked")} value={rows.length} />
          <Stat
            label={t("stock.states.low")}
            value={<span className={below ? "text-destructive" : undefined}>{t("stock.belowThreshold", { count: below })}</span>}
          />
          {seeAll && <Stat label={t("stock.totalValue")} value={f.money(Math.round(totalValue))} />}
        </CardContent>
      </Card>

      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative lg:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("stock.searchPlaceholder")} aria-label={t("stock.searchPlaceholder")} className="pl-9" />
        </div>
        <ChoiceChips
          label={t("stock.allKinds")}
          value={kind}
          onChange={(v) => setKind(v as ProductKind | "all")}
          options={[
            { value: "all", label: t("stock.allKinds") },
            { value: "frame", label: t("stock.kinds.frame") },
            { value: "lens", label: t("stock.kinds.lens") },
            { value: "accessory", label: t("stock.kinds.accessory") },
          ]}
        />
        <Toggle
          pressed={lowOnly}
          onPressedChange={setLowOnly}
          variant="outline"
          className="h-10 rounded-full px-4 data-[state=on]:border-destructive data-[state=on]:bg-destructive/10 data-[state=on]:text-destructive pointer-coarse:h-11 lg:ml-auto"
        >
          <span className="size-2 rounded-full bg-destructive" aria-hidden="true" />
          {t("stock.lowOnly")}
        </Toggle>
      </div>

      <Card className="py-0">
        <DataTable
          key={locationId}
          rows={filtered}
          columns={columns}
          rowKey={(r) => r.product.id}
          initialSort={{ id: "qty", desc: false }}
          onRowClick={(r) => setDrawerProduct(r.product.id)}
          loading={loading}
          caption={t("stock.title")}
          empty={<EmptyState illustration="stock" title={t("stock.empty")} body={t("common.noResultsBody")} />}
          mobileCard={(r) => (
            <button type="button" onClick={() => setDrawerProduct(r.product.id)} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-muted">
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{r.product.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {labels.option(r.product.brandId)} · {labels.option(r.product.categoryId)}
                </span>
              </span>
              <span className="text-right">
                <span className={cn("num inline-flex h-7 min-w-10 items-center justify-center rounded-lg px-2 font-bold", QTY_TONE[r.state])}>{r.qty}</span>
                {r.min !== undefined && <span className="num block text-[11px] text-muted-foreground">min {r.min}</span>}
              </span>
            </button>
          )}
        />
      </Card>

      <MovementsDrawer productId={drawerProduct} locationId={locationId} onClose={() => setDrawerProduct(null)} />
      <AdjustDialog target={adjustTarget} onClose={() => setAdjustTarget(null)} />
    </>
  );
}
