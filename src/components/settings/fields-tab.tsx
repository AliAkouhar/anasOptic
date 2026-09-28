"use client";

import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { EmptyState } from "@/components/shared/page";
import { CustomFieldInput } from "@/components/orders/new-order/step-measures";
import { useLabels } from "@/data/hooks";
import { customFieldsRepo, customFieldUsage } from "@/data/repositories";
import { useDbStore } from "@/data/store";
import type { CustomField, CustomFieldType } from "@/lib/types";
import { cn } from "@/lib/utils";
import { SortableList } from "./sortable-list";

const TYPES: CustomFieldType[] = ["text", "number", "date", "select"];

function FieldDialog({ field, onClose }: { field?: CustomField; onClose: () => void }) {
  const t = useTranslations("settings.fields");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const feedback = useFeedback();
  const [labelFr, setLabelFr] = useState(field?.labelFr ?? "");
  const [labelEn, setLabelEn] = useState(field?.labelEn ?? "");
  const [type, setType] = useState<CustomFieldType>(field?.type ?? "text");
  const [optionsFr, setOptionsFr] = useState((field?.optionsFr ?? []).join("\n"));
  const [optionsEn, setOptionsEn] = useState((field?.optionsEn ?? []).join("\n"));
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const lines = (s: string) => s.split("\n").map((x) => x.trim()).filter(Boolean);

  const save = async () => {
    setTouched(true);
    if (!labelFr.trim()) return;
    setPending(true);
    const input = { labelFr, labelEn, type, optionsFr: lines(optionsFr), optionsEn: lines(optionsEn).length ? lines(optionsEn) : lines(optionsFr) };
    try {
      if (field) {
        const { undo } = await customFieldsRepo.update(field.id, input);
        feedback.success(t("saved", { label: labelFr }), { undo });
      } else {
        await customFieldsRepo.create(input);
        feedback.success(t("saved", { label: labelFr }));
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
      title={field ? t("editTitle") : t("createTitle")}
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
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="cf-fr">{t("labelFr")}</Label>
            <Input id="cf-fr" value={labelFr} onChange={(e) => setLabelFr(e.target.value)} aria-invalid={touched && !labelFr.trim()} placeholder="Ex. Écart pupillaire (mm)" />
            {touched && !labelFr.trim() && <p className="text-sm text-destructive">{te("name_required")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="cf-en">{t("labelEn")}</Label>
            <Input id="cf-en" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} placeholder="E.g. Pupillary distance (mm)" />
          </div>
        </div>
        <div className="space-y-2">
          <Label>{t("type")}</Label>
          <ChoiceChips label={t("type")} value={type} onChange={(v) => setType(v as CustomFieldType)} options={TYPES.map((ty) => ({ value: ty, label: t(`types.${ty}`) }))} />
        </div>
        {type === "select" && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="cf-ofr">{t("optionsFr")}</Label>
              <Textarea id="cf-ofr" rows={4} value={optionsFr} onChange={(e) => setOptionsFr(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="cf-oen">{t("optionsEn")}</Label>
              <Textarea id="cf-oen" rows={4} value={optionsEn} onChange={(e) => setOptionsEn(e.target.value)} />
            </div>
          </div>
        )}
      </div>
    </ResponsiveDialog>
  );
}

export function FieldsTab() {
  const t = useTranslations("settings.fields");
  const tc = useTranslations("common");
  const labels = useLabels();
  const feedback = useFeedback();
  const db = useDbStore((s) => s.db)!;
  const [editing, setEditing] = useState<CustomField | "new" | null>(null);
  const [deleting, setDeleting] = useState<CustomField | null>(null);
  const [preview, setPreview] = useState<Record<string, string>>({});
  const fields = useMemo(() => [...db.customFields].sort((a, b) => a.sortOrder - b.sortOrder), [db.customFields]);
  const visible = fields.filter((f) => f.isActive);

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button onClick={() => setEditing("new")}>
            <Plus />
            {t("add")}
          </Button>
          {fields.length === 0 ? (
            <EmptyState illustration="orders" title={t("empty")} className="py-8" />
          ) : (
            <SortableList
              items={fields}
              handleLabel={(f) => labels.localized(f)}
              onReorder={async (ids) => {
                const { undo } = await customFieldsRepo.reorder(ids);
                feedback.success(tc("saved"), { undo });
              }}
              renderItem={(f) => {
                const used = customFieldUsage(db, f.id);
                return (
                  <div className={cn("flex flex-wrap items-center gap-3 py-2.5", !f.isActive && "opacity-60")}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{labels.localized(f)}</p>
                      <p className="text-xs text-muted-foreground">
                        <Badge variant="secondary" className="mr-2">
                          {t(`types.${f.type}`)}
                        </Badge>
                        {t("used", { count: used })}
                      </p>
                    </div>
                    <label className="flex items-center gap-2 text-sm">
                      <Switch
                        checked={f.isActive}
                        onCheckedChange={async (v) => {
                          const { undo } = await customFieldsRepo.setActive(f.id, v);
                          feedback.success(v ? t("restored") : t("archived"), { undo });
                        }}
                        aria-label={t("active")}
                      />
                      <span className="hidden sm:inline">{t("active")}</span>
                    </label>
                    <Button variant="ghost" size="icon-sm" onClick={() => setEditing(f)} aria-label={`${t("editTitle")} · ${labels.localized(f)}`}>
                      <Pencil />
                    </Button>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span>
                          <Button variant="ghost" size="icon-sm" disabled={used > 0} onClick={() => setDeleting(f)} aria-label={`${tc("delete")} · ${labels.localized(f)}`}>
                            <Trash2 />
                          </Button>
                        </span>
                      </TooltipTrigger>
                      {used > 0 && <TooltipContent>{t("cannotDelete")}</TooltipContent>}
                    </Tooltip>
                  </div>
                );
              }}
            />
          )}
        </CardContent>
      </Card>

      <Card className="self-start">
        <CardHeader>
          <CardTitle>{t("preview")}</CardTitle>
          <CardDescription>{t("previewHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {visible.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t("previewEmpty")}</p>
          ) : (
            visible.map((f) => <CustomFieldInput key={f.id} field={f} value={preview[f.id] ?? ""} onChange={(v) => setPreview((p) => ({ ...p, [f.id]: v }))} />)
          )}
        </CardContent>
      </Card>

      {editing && <FieldDialog key={editing === "new" ? "new" : editing.id} field={editing === "new" ? undefined : editing} onClose={() => setEditing(null)} />}
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("deleteTitle", { label: deleting ? labels.localized(deleting) : "" })}
        description={t("deleteBody")}
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await customFieldsRepo.remove(deleting.id);
            feedback.success(t("deleted"));
          } catch (e) {
            feedback.error(e);
          }
        }}
      />
    </div>
  );
}
