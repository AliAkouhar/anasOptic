"use client";

import { Archive, Info, Lock, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { StatusBadge } from "@/components/shared/badges";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { EmptyState } from "@/components/shared/page";
import { getOptionUsage, totalUsage } from "@/data/indexes";
import { optionsRepo } from "@/data/repositories";
import { useDbStore } from "@/data/store";
import { FIXED_CHARGE_TYPES, ORDER_STATUSES, type Option, type OptionListKey } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SortableList } from "./sortable-list";

const LISTS: OptionListKey[] = ["brand", "product_category", "lens_type", "lens_treatment", "frame_material", "payment_method", "supplier_category"];

function LabelInput({ value, onSave, label, className }: { value: string; onSave: (v: string) => void; label: string; className?: string }) {
  const [draft, setDraft] = useState(value);
  const [synced, setSynced] = useState(value);
  if (value !== synced) {
    setSynced(value);
    setDraft(value);
  }
  return (
    <Input
      value={draft}
      aria-label={label}
      className={cn("h-9 pointer-coarse:h-10", className)}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        if (draft.trim() && draft.trim() !== value) onSave(draft.trim());
        else setDraft(value);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
    />
  );
}

export function ListsTab() {
  const t = useTranslations("settings.lists");
  const tc = useTranslations();
  const feedback = useFeedback();
  const db = useDbStore((s) => s.db)!;
  const [listKey, setListKey] = useState<OptionListKey>("brand");
  const [showArchived, setShowArchived] = useState(false);
  const [newFr, setNewFr] = useState("");
  const [newEn, setNewEn] = useState("");
  const [confirm, setConfirm] = useState<{ option: Option; kind: "archive" | "delete" } | null>(null);
  const usage = getOptionUsage(db);
  const items = useMemo(
    () => db.options.filter((o) => o.listKey === listKey && (showArchived || o.isActive)).sort((a, b) => a.sortOrder - b.sortOrder),
    [db.options, listKey, showArchived],
  );
  const archivedCount = db.options.filter((o) => o.listKey === listKey && !o.isActive).length;

  const add = async () => {
    if (!newFr.trim()) return;
    try {
      const { option } = await optionsRepo.create(listKey, { labelFr: newFr, labelEn: newEn });
      feedback.success(t("added", { label: option.labelFr }));
      setNewFr("");
      setNewEn("");
    } catch (e) {
      feedback.error(e);
    }
  };

  const rename = async (option: Option, patch: Partial<Pick<Option, "labelFr" | "labelEn">>) => {
    try {
      const labels = { labelFr: patch.labelFr ?? option.labelFr, labelEn: patch.labelEn ?? option.labelEn };
      const { undo } = await optionsRepo.rename(option.id, labels);
      feedback.success(t("renamed", { label: patch.labelFr ?? patch.labelEn ?? "" }), { undo });
    } catch (e) {
      feedback.error(e);
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <Select value={listKey} onValueChange={(v) => setListKey(v as OptionListKey)}>
              <SelectTrigger className="w-full sm:w-72" aria-label={t("title")}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LISTS.map((k) => (
                  <SelectItem key={k} value={k}>
                    {t(`names.${k}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <label className="flex items-center gap-2 text-sm sm:ml-auto">
              <Switch checked={showArchived} onCheckedChange={setShowArchived} />
              {t("showArchived")}
              {archivedCount > 0 && <Badge variant="secondary">{archivedCount}</Badge>}
            </label>
          </div>

          <form
            className="flex flex-col gap-2 rounded-xl bg-muted/50 p-3 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              void add();
            }}
          >
            <Input value={newFr} onChange={(e) => setNewFr(e.target.value)} placeholder={t("newPlaceholder")} aria-label={t("labelFr")} className="bg-card" />
            <Input value={newEn} onChange={(e) => setNewEn(e.target.value)} placeholder={t("labelEn")} aria-label={t("labelEn")} className="bg-card" />
            <Button type="submit" disabled={!newFr.trim()}>
              <Plus />
              {t("add")}
            </Button>
          </form>

          <div className="hidden grid-cols-[2.75rem_1fr_1fr_11rem_7rem] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
            <span />
            <span>{t("labelFr")}</span>
            <span>{t("labelEn")}</span>
            <span />
            <span />
          </div>
          {items.length === 0 ? (
            <EmptyState illustration="box" title={t("empty")} className="py-8" />
          ) : (
            <SortableList
              items={items}
              handleLabel={(o) => t("drag", { label: o.labelFr })}
              onReorder={async (ids) => {
                try {
                  const { undo } = await optionsRepo.reorder(ids);
                  feedback.success(t("reordered"), { undo });
                } catch (e) {
                  feedback.error(e);
                }
              }}
              renderItem={(o) => {
                const u = usage.get(o.id);
                const used = totalUsage(u);
                return (
                  <div className={cn("grid gap-2 py-2 md:grid-cols-[1fr_1fr_11rem_7rem] md:items-center", !o.isActive && "opacity-60")}>
                    <LabelInput value={o.labelFr} label={`${t("labelFr")} · ${o.labelFr}`} onSave={(v) => rename(o, { labelFr: v })} />
                    <LabelInput value={o.labelEn} label={`${t("labelEn")} · ${o.labelFr}`} onSave={(v) => rename(o, { labelEn: v })} />
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="num w-fit cursor-default text-xs text-muted-foreground" tabIndex={0}>
                          {u && u.orders ? t("usageOrders", { count: u.orders }) : t("usage", { count: used })}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent>
                        {t("usageDetail", { orders: u?.orders ?? 0, products: u?.products ?? 0, payments: u?.payments ?? 0, suppliers: u?.suppliers ?? 0 })}
                      </TooltipContent>
                    </Tooltip>
                    <div className="flex justify-end">
                      {!o.isActive ? (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            const { undo } = await optionsRepo.setActive(o.id, true);
                            feedback.success(t("restored", { label: o.labelFr }), { undo });
                          }}
                        >
                          <RotateCcw />
                          {tc("common.restore")}
                        </Button>
                      ) : used > 0 ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button variant="outline" size="sm" onClick={() => setConfirm({ option: o, kind: "archive" })}>
                              <Archive />
                              {t("archive")}
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent className="max-w-64">{t("archiveHint")}</TooltipContent>
                        </Tooltip>
                      ) : (
                        <Button variant="ghost" size="sm" className="text-destructive" onClick={() => setConfirm({ option: o, kind: "delete" })}>
                          <Trash2 />
                          {tc("common.delete")}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="size-4 text-muted-foreground" aria-hidden="true" />
            {t("fixedTitle")}
          </CardTitle>
          <CardDescription className="flex items-start gap-2">
            <Info className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
            {t("fixedBody")}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-6 md:grid-cols-2">
          <div className="space-y-2">
            <Label>{t("statuses")}</Label>
            <div className="flex flex-wrap gap-2">
              {ORDER_STATUSES.map((s) => (
                <StatusBadge key={s} status={s} />
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("chargeKinds")}</Label>
            <ul className="space-y-1 text-sm">
              <li>
                <span className="font-medium">{t("chargeFixed")}</span>
                <span className="text-muted-foreground"> : {FIXED_CHARGE_TYPES.map((c) => tc(`charges.types.${c}`)).join(", ")}</span>
              </li>
              <li className="font-medium">{t("chargeVariable")}</li>
            </ul>
          </div>
        </CardContent>
      </Card>

      <ConfirmDialog
        open={!!confirm}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive={confirm?.kind === "delete"}
        title={confirm ? t(confirm.kind === "archive" ? "archiveTitle" : "deleteTitle", { label: confirm.option.labelFr }) : ""}
        description={confirm?.kind === "archive" ? t("archiveBody") : t("deleteBody")}
        confirmLabel={confirm?.kind === "archive" ? t("archive") : tc("common.delete")}
        onConfirm={async () => {
          if (!confirm) return;
          try {
            if (confirm.kind === "archive") {
              const { undo } = await optionsRepo.setActive(confirm.option.id, false);
              feedback.success(t("archived", { label: confirm.option.labelFr }), { undo });
            } else {
              await optionsRepo.remove(confirm.option.id);
              feedback.success(t("deleted", { label: confirm.option.labelFr }));
            }
          } catch (e) {
            feedback.error(e);
          }
        }}
      />
    </div>
  );
}
