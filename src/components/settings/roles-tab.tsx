"use client";

import { Loader2, Lock, Plus, ShieldCheck, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { useLabels } from "@/data/hooks";
import { rolesRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { PERMISSION_GROUPS, PERMISSIONS, type PermissionKey } from "@/lib/permissions";
import type { Role } from "@/lib/types";
import { cn } from "@/lib/utils";

const LOCKED_ROLE = "role_admin";

function CreateRoleDialog({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const t = useTranslations("settings.roles");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const labels = useLabels();
  const feedback = useFeedback();
  const roles = useDb((db) => db.roles);
  const [labelFr, setLabelFr] = useState("");
  const [labelEn, setLabelEn] = useState("");
  const [from, setFrom] = useState("empty");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const create = async () => {
    setTouched(true);
    if (!labelFr.trim()) return;
    setPending(true);
    try {
      const { role } = await rolesRepo.create({ labelFr, labelEn, permissions: from === "empty" ? [] : (roles.find((r) => r.id === from)?.permissions ?? []) });
      feedback.success(t("created", { name: role.labelFr }));
      onCreated(role.id);
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
      title={t("createTitle")}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            {tc("cancel")}
          </Button>
          <Button onClick={create} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}
            {tc("create")}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="role-fr">{t("nameFr")}</Label>
            <Input id="role-fr" value={labelFr} onChange={(e) => setLabelFr(e.target.value)} placeholder={t("namePlaceholder")} aria-invalid={touched && !labelFr.trim()} />
            {touched && !labelFr.trim() && <p className="text-sm text-destructive">{te("name_required")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="role-en">{t("nameEn")}</Label>
            <Input id="role-en" value={labelEn} onChange={(e) => setLabelEn(e.target.value)} placeholder="Workshop technician" />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="role-from">{t("startFrom")}</Label>
          <Select value={from} onValueChange={setFrom}>
            <SelectTrigger id="role-from" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="empty">{t("empty")}</SelectItem>
              {roles.map((r) => (
                <SelectItem key={r.id} value={r.id}>
                  {labels.localized(r)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

function RoleEditor({ role }: { role: Role }) {
  const t = useTranslations("settings.roles");
  const tp = useTranslations("perm");
  const tc = useTranslations("common");
  const feedback = useFeedback();
  const users = useDb((db) => db.users);
  const locked = role.id === LOCKED_ROLE;
  const [labelFr, setLabelFr] = useState(role.labelFr);
  const [labelEn, setLabelEn] = useState(role.labelEn);
  const [perms, setPerms] = useState<Set<PermissionKey>>(() => new Set(role.permissions));
  const [pending, setPending] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const userCount = users.filter((u) => u.roleId === role.id).length;
  const dirty =
    labelFr !== role.labelFr || labelEn !== role.labelEn || perms.size !== role.permissions.length || role.permissions.some((p) => !perms.has(p));

  const toggle = (key: PermissionKey, on: boolean) =>
    setPerms((s) => {
      const next = new Set(s);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  const save = async () => {
    setPending(true);
    try {
      const { undo } = await rolesRepo.update(role.id, { labelFr, labelEn, permissions: PERMISSIONS.filter((p) => perms.has(p)) });
      feedback.success(t("saved", { name: labelFr }), { undo });
    } catch (e) {
      feedback.error(e);
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle>{role.labelFr}</CardTitle>
          {role.isSystem && <Badge variant="secondary">{t("system")}</Badge>}
          <span className="num ml-auto text-sm text-muted-foreground">{t("count", { count: perms.size, total: PERMISSIONS.length })}</span>
        </div>
        {locked && (
          <CardDescription className="flex items-center gap-2">
            <Lock className="size-4 shrink-0" aria-hidden="true" />
            {t("locked")}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor={`rn-fr-${role.id}`}>{t("nameFr")}</Label>
            <Input id={`rn-fr-${role.id}`} value={labelFr} onChange={(e) => setLabelFr(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`rn-en-${role.id}`}>{t("nameEn")}</Label>
            <Input id={`rn-en-${role.id}`} value={labelEn} onChange={(e) => setLabelEn(e.target.value)} />
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {PERMISSION_GROUPS.map((group) => {
            const all = group.permissions.every((p) => perms.has(p));
            return (
              <fieldset key={group.id} className="rounded-2xl border p-4">
                <legend className="sr-only">{tp(`groups.${group.id}`)}</legend>
                <div className="mb-3 flex items-center justify-between gap-2">
                  <p className="font-semibold" aria-hidden="true">
                    {tp(`groups.${group.id}`)}
                  </p>
                  {!locked && group.permissions.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => group.permissions.forEach((p) => toggle(p, !all))}
                      className="h-7 px-2 text-xs"
                    >
                      {all ? tc("none") : t("selectAll")}
                    </Button>
                  )}
                </div>
                <ul className="space-y-3">
                  {group.permissions.map((key) => {
                    const id = `perm-${role.id}-${key}`;
                    return (
                      <li key={key} className="flex items-start gap-3">
                        <Checkbox id={id} checked={perms.has(key)} disabled={locked} onCheckedChange={(v) => toggle(key, v === true)} className="mt-0.5" />
                        <label htmlFor={id} className={cn("cursor-pointer text-sm leading-tight", locked && "cursor-default")}>
                          <span className="block font-medium">{tp(`${key}.label` as "dashboard.view.label")}</span>
                          <span className="block text-xs text-muted-foreground">{tp(`${key}.desc` as "dashboard.view.desc")}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            );
          })}
        </div>
        <div className="flex flex-wrap items-center gap-3 border-t pt-4">
          {!role.isSystem && (
            <Button variant="ghost" className="text-destructive" disabled={userCount > 0} onClick={() => setDeleting(true)} title={userCount > 0 ? t("users", { count: userCount }) : undefined}>
              <Trash2 />
              {t("delete")}
            </Button>
          )}
          {dirty && <span className="text-sm text-attention-text">{t("unsaved")}</span>}
          <Button className="ml-auto" onClick={save} disabled={!dirty || pending}>
            {pending && <Loader2 className="animate-spin" />}
            {t("save")}
          </Button>
        </div>
      </CardContent>
      <ConfirmDialog
        open={deleting}
        onOpenChange={setDeleting}
        title={t("deleteTitle", { name: role.labelFr })}
        description={t("deleteBody")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          try {
            await rolesRepo.remove(role.id);
            feedback.success(t("deleted"));
          } catch (e) {
            feedback.error(e);
          }
        }}
      />
    </Card>
  );
}

export function RolesTab() {
  const t = useTranslations("settings.roles");
  const labels = useLabels();
  const roles = useDb((db) => db.roles);
  const users = useDb((db) => db.users);
  const [selectedId, setSelectedId] = useState<string>(roles[0]?.id ?? "");
  const [creating, setCreating] = useState(false);
  const selected = roles.find((r) => r.id === selectedId) ?? roles[0];
  const counts = useMemo(() => new Map(roles.map((r) => [r.id, users.filter((u) => u.roleId === r.id).length])), [roles, users]);

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </CardHeader>
      </Card>
      <div className="grid gap-6 lg:grid-cols-[260px_minmax(0,1fr)]">
        <div className="space-y-2">
          <ul className="space-y-2" role="listbox" aria-label={t("title")}>
            {roles.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={r.id === selected?.id}
                  onClick={() => setSelectedId(r.id)}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-colors hover:border-primary/40",
                    r.id === selected?.id && "border-primary bg-accent/60",
                  )}
                >
                  <ShieldCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{labels.localized(r)}</span>
                    <span className="block text-xs text-muted-foreground">{t("users", { count: counts.get(r.id) ?? 0 })}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          <Button variant="outline" className="w-full" onClick={() => setCreating(true)}>
            <Plus />
            {t("add")}
          </Button>
        </div>
        {selected && <RoleEditor key={`${selected.id}-${selected.permissions.join()}-${selected.labelFr}`} role={selected} />}
      </div>
      {creating && <CreateRoleDialog onClose={() => setCreating(false)} onCreated={setSelectedId} />}
    </div>
  );
}
