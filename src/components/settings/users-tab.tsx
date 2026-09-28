"use client";

import { CheckCircle2, Loader2, Mail, UserPlus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog, ResponsiveDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { useActiveLocations, useLabels, useRequiredAuth } from "@/data/hooks";
import { usersRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { initials } from "@/lib/format";
import type { ID, User } from "@/lib/types";
import { cn } from "@/lib/utils";

function StatusPill({ user }: { user: User }) {
  const t = useTranslations("settings.users");
  const tone = !user.isActive
    ? "bg-slate-100 text-slate-600 dark:bg-slate-500/15 dark:text-slate-300"
    : user.invitedAt
      ? "bg-blue-50 text-blue-700 dark:bg-blue-500/15 dark:text-blue-300"
      : "bg-success/10 text-success-text";
  return (
    <span className={cn("inline-flex h-6 items-center rounded-full px-2.5 text-xs font-medium whitespace-nowrap", tone)}>
      {!user.isActive ? t("disabled") : user.invitedAt ? t("invited") : t("active")}
    </span>
  );
}

function InviteDialog({ onClose }: { onClose: () => void }) {
  const t = useTranslations("settings.users");
  const tc = useTranslations("common");
  const te = useTranslations("errors");
  const ta = useTranslations("auth");
  const labels = useLabels();
  const feedback = useFeedback();
  const roles = useDb((db) => db.roles);
  const stores = useActiveLocations();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [roleId, setRoleId] = useState(roles.find((r) => r.id === "role_secretary")?.id ?? roles[0]?.id ?? "");
  const [locationId, setLocationId] = useState<string>(stores.find((s) => s.type === "store")?.id ?? "none");
  const [touched, setTouched] = useState(false);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const send = async () => {
    setTouched(true);
    if (!fullName.trim() || !emailOk) return;
    setPending(true);
    try {
      await usersRepo.invite({ fullName, email, roleId, locationId: locationId === "none" ? null : locationId });
      setSent(email.trim());
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
      title={sent ? t("sent") : t("inviteTitle")}
      footer={
        sent ? (
          <Button onClick={onClose}>{t("done")}</Button>
        ) : (
          <>
            <Button variant="outline" onClick={onClose}>
              {tc("cancel")}
            </Button>
            <Button onClick={send} disabled={pending}>
              {pending ? <Loader2 className="animate-spin" /> : <Mail />}
              {t("send")}
            </Button>
          </>
        )
      }
    >
      {sent ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center motion-safe:animate-pop-in" role="status">
          <CheckCircle2 className="size-14 text-success-text" aria-hidden="true" />
          <p className="max-w-sm text-sm text-muted-foreground">{t("sentBody", { email: sent })}</p>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="inv-name">{t("fullName")}</Label>
            <Input id="inv-name" value={fullName} onChange={(e) => setFullName(e.target.value)} aria-invalid={touched && !fullName.trim()} placeholder="Ex. Omar Benjelloun" />
            {touched && !fullName.trim() && <p className="text-sm text-destructive">{te("name_required")}</p>}
          </div>
          <div className="space-y-2">
            <Label htmlFor="inv-email">{t("email")}</Label>
            <Input id="inv-email" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} aria-invalid={touched && !emailOk} placeholder="prenom.nom@anassvision.ma" />
            {touched && !emailOk && <p className="text-sm text-destructive">{ta("emailInvalid")}</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inv-role">{t("role")}</Label>
              <Select value={roleId} onValueChange={setRoleId}>
                <SelectTrigger id="inv-role" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roles.map((r) => (
                    <SelectItem key={r.id} value={r.id}>
                      {labels.localized(r)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-loc">{t("location")}</Label>
              <Select value={locationId} onValueChange={setLocationId}>
                <SelectTrigger id="inv-loc" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">{t("noLocation")}</SelectItem>
                  {stores.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
      )}
    </ResponsiveDialog>
  );
}

export function UsersTab() {
  const t = useTranslations("settings.users");
  const labels = useLabels();
  const feedback = useFeedback();
  const auth = useRequiredAuth();
  const users = useDb((db) => db.users);
  const roles = useDb((db) => db.roles);
  const locations = useActiveLocations();
  const [inviting, setInviting] = useState(false);
  const [deactivating, setDeactivating] = useState<User | null>(null);

  const update = async (user: User, patch: { roleId?: ID; locationId?: ID | null }, what: string) => {
    try {
      const { undo } = await usersRepo.update(user.id, { roleId: patch.roleId ?? user.roleId, locationId: patch.locationId !== undefined ? patch.locationId : user.locationId });
      feedback.success(t("updated", { name: user.fullName, what }), { undo });
    } catch (e) {
      feedback.error(e);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button onClick={() => setInviting(true)}>
          <UserPlus />
          {t("invite")}
        </Button>
        <ul className="divide-y rounded-2xl border">
          {users.map((u) => {
            const self = u.id === auth.user.id;
            return (
              <li key={u.id} className={cn("grid gap-3 p-4 lg:grid-cols-[minmax(0,1.4fr)_12rem_14rem_8rem_auto] lg:items-center", !u.isActive && "bg-muted/40")}>
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar className="size-10">
                    <AvatarFallback className={cn("text-sm font-semibold", u.isActive ? "bg-accent text-accent-foreground" : "bg-muted text-muted-foreground")}>
                      {initials(u.fullName)}
                    </AvatarFallback>
                  </Avatar>
                  <div className="min-w-0">
                    <p className="truncate font-medium">
                      {u.fullName} {self && <span className="text-xs font-normal text-muted-foreground">({t("you")})</span>}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">{u.email}</p>
                  </div>
                </div>
                <Select value={u.roleId} onValueChange={(v) => update(u, { roleId: v }, t("roleWord"))} disabled={self}>
                  <SelectTrigger className="w-full" aria-label={`${t("role")} · ${u.fullName}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.id} value={r.id}>
                        {labels.localized(r)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={u.locationId ?? "none"} onValueChange={(v) => update(u, { locationId: v === "none" ? null : v }, t("locationWord"))}>
                  <SelectTrigger className="w-full" aria-label={`${t("location")} · ${u.fullName}`}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("noLocation")}</SelectItem>
                    {locations.map((l) => (
                      <SelectItem key={l.id} value={l.id}>
                        {l.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <StatusPill user={u} />
                <label className="flex items-center gap-2 text-sm lg:justify-end">
                  <span className="lg:sr-only">{t("active")}</span>
                  <Switch
                    checked={u.isActive}
                    disabled={self}
                    aria-label={`${t("active")} · ${u.fullName}`}
                    onCheckedChange={async (v) => {
                      if (!v) {
                        setDeactivating(u);
                        return;
                      }
                      try {
                        const { undo } = await usersRepo.setActive(u.id, true);
                        feedback.success(t("activated", { name: u.fullName }), { undo });
                      } catch (e) {
                        feedback.error(e);
                      }
                    }}
                  />
                </label>
              </li>
            );
          })}
        </ul>
      </CardContent>
      {inviting && <InviteDialog onClose={() => setInviting(false)} />}
      <ConfirmDialog
        open={!!deactivating}
        onOpenChange={(o) => !o && setDeactivating(null)}
        title={t("deactivateTitle", { name: deactivating?.fullName ?? "" })}
        description={t("deactivateBody")}
        confirmLabel={t("deactivate")}
        onConfirm={async () => {
          if (!deactivating) return;
          try {
            const { undo } = await usersRepo.setActive(deactivating.id, false);
            feedback.success(t("deactivated", { name: deactivating.fullName }), { undo });
          } catch (e) {
            feedback.error(e);
          }
        }}
      />
    </Card>
  );
}
