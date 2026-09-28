"use client";

import { Loader2, RotateCcw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentBadge } from "@/components/shared/badges";
import { ConfirmDialog } from "@/components/shared/dialogs";
import { useFeedback } from "@/components/shared/feedback";
import { useResetDemo } from "@/components/layout/user-menu";
import { DEMO_PASSWORD } from "@/data/constants";
import { useFormat, useLabels } from "@/data/hooks";
import { clientStats } from "@/data/indexes";
import { appSettingsRepo } from "@/data/repositories";
import { useDb, useDbStore } from "@/data/store";
import { clientSegment } from "@/lib/calculations";
import type { ClientSegment } from "@/lib/types";

export function LoyaltyTab() {
  const t = useTranslations("settings.loyalty");
  const tc = useTranslations("common");
  const f = useFormat();
  const feedback = useFeedback();
  const db = useDbStore((s) => s.db)!;
  const [regular, setRegular] = useState(db.loyalty.regularMinOrders);
  const [loyal, setLoyal] = useState(db.loyalty.loyalMinOrders);
  const [pending, setPending] = useState(false);
  const valid = regular >= 1 && loyal > regular;
  const stats = clientStats(db, null);
  const split = useMemo(() => {
    const c: Record<ClientSegment, number> = { new: 0, regular: 0, loyal: 0 };
    if (!valid) return c;
    for (const s of stats.values()) c[clientSegment(s.globalOrderCount, { regularMinOrders: regular, loyalMinOrders: loyal })]++;
    return c;
  }, [stats, regular, loyal, valid]);
  const total = split.new + split.regular + split.loyal || 1;
  const dirty = regular !== db.loyalty.regularMinOrders || loyal !== db.loyalty.loyalMinOrders;

  const numberInput = (id: string, value: number, onChange: (n: number) => void) => (
    <Input
      id={id}
      inputMode="numeric"
      className="num w-20 text-center text-lg font-semibold"
      value={value}
      onChange={(e) => {
        const n = parseInt(e.target.value.replace(/\D/g, ""), 10);
        onChange(Number.isNaN(n) ? 0 : n);
      }}
    />
  );

  return (
    <Card className="max-w-3xl">
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="loy-regular" className="flex items-center gap-2">
              <SegmentBadge segment="regular" /> {t("regular")}
            </Label>
            <div className="flex items-center gap-2">
              {numberInput("loy-regular", regular, setRegular)}
              <span className="text-sm text-muted-foreground">{t("orders")}</span>
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="loy-loyal" className="flex items-center gap-2">
              <SegmentBadge segment="loyal" /> {t("loyal")}
            </Label>
            <div className="flex items-center gap-2">
              {numberInput("loy-loyal", loyal, setLoyal)}
              <span className="text-sm text-muted-foreground">{t("orders")}</span>
            </div>
          </div>
        </div>
        {!valid && <p className="text-sm text-destructive">{t("invalid")}</p>}
        <div className="space-y-3 rounded-2xl bg-muted/50 p-4" aria-live="polite">
          <p className="text-sm font-medium">{t("preview")}</p>
          <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" aria-hidden="true">
            {(["new", "regular", "loyal"] as const).map((s, i) => (
              <div key={s} style={{ width: `${(split[s] / total) * 100}%`, background: `var(--chart-${i + 1})` }} className="transition-[width] duration-300" />
            ))}
          </div>
          <ul className="grid grid-cols-3 gap-2 text-sm">
            {(["new", "regular", "loyal"] as const).map((s) => (
              <li key={s}>
                <SegmentBadge segment={s} />
                <p className="num mt-1 font-semibold">
                  {split[s]} <span className="font-normal text-muted-foreground">· {f.percent(split[s] / total)}</span>
                </p>
              </li>
            ))}
          </ul>
        </div>
        <div className="flex justify-end">
          <Button
            disabled={!valid || !dirty || pending}
            onClick={async () => {
              setPending(true);
              try {
                const { undo } = await appSettingsRepo.setLoyalty({ regularMinOrders: regular, loyalMinOrders: loyal });
                feedback.success(t("saved"), { undo });
              } catch (e) {
                feedback.error(e);
              } finally {
                setPending(false);
              }
            }}
          >
            {pending && <Loader2 className="animate-spin" />}
            {tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function DemoTab() {
  const t = useTranslations("settings.demo");
  const ts = useTranslations("shell");
  const tc = useTranslations("common");
  const labels = useLabels();
  const feedback = useFeedback();
  const resetDemo = useResetDemo();
  const appName = useDb((db) => db.settings.appName);
  const users = useDb((db) => db.users);
  const [name, setName] = useState(appName);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="grid max-w-5xl gap-6 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>{t("brand")}</CardTitle>
          <CardDescription>{t("brandHint")}</CardDescription>
        </CardHeader>
        <CardContent>
          <form
            className="flex gap-2"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                const { undo } = await appSettingsRepo.setAppName(name);
                feedback.success(t("brandSaved"), { undo });
              } catch (err) {
                feedback.error(err);
              }
            }}
          >
            <Input value={name} onChange={(e) => setName(e.target.value)} aria-label={t("brand")} />
            <Button type="submit" disabled={!name.trim() || name === appName}>
              {tc("save")}
            </Button>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>{t("reset")}</CardTitle>
          <CardDescription>{t("resetBody")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" onClick={() => setConfirm(true)}>
            <RotateCcw />
            {t("reset")}
          </Button>
        </CardContent>
      </Card>
      <Card className="lg:col-span-2">
        <CardHeader>
          <CardTitle>{t("accounts")}</CardTitle>
          <CardDescription>
            {t("accountsBody")} <code className="rounded bg-muted px-1.5 py-0.5">{DEMO_PASSWORD}</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ul className="divide-y rounded-xl border text-sm">
            {users
              .filter((u) => u.isActive)
              .map((u) => (
                <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5">
                  <span className="font-medium">{u.fullName}</span>
                  <code className="text-xs text-muted-foreground">{u.email}</code>
                  <span className="text-xs text-muted-foreground">
                    {labels.role(u.roleId)} · {u.locationId ? labels.location(u.locationId) : ts("noLocation")}
                  </span>
                </li>
              ))}
          </ul>
        </CardContent>
      </Card>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title={ts("resetDemoTitle")} description={ts("resetDemoBody")} confirmLabel={ts("resetDemoConfirm")} onConfirm={resetDemo} />
    </div>
  );
}
