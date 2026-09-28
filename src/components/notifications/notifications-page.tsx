"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ChoiceChips } from "@/components/shared/choice-chips";
import { useFeedback } from "@/components/shared/feedback";
import { EmptyState, ListSkeleton, PageHeader } from "@/components/shared/page";
import { useMyNotifications } from "@/components/layout/notification-bell";
import { useSimulatedLoading } from "@/data/hooks";
import { notificationsRepo } from "@/data/repositories";
import { useRouter } from "@/i18n/navigation";
import type { NotificationType } from "@/lib/types";
import { NotificationRow, useNotificationContent } from "./notification-item";

const TYPES: NotificationType[] = ["order_costs_needed", "low_stock", "order_in_store"];

export function NotificationsPage() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const feedback = useFeedback();
  const loading = useSimulatedLoading();
  const mine = useMyNotifications();
  const content = useNotificationContent();
  const [type, setType] = useState<NotificationType | "all">("all");
  const [state, setState] = useState<"all" | "unread" | "read">("all");
  const [limit, setLimit] = useState(40);
  const unread = mine.filter((n) => !n.read).length;

  const list = useMemo(
    () => mine.filter((n) => (type === "all" || n.type === type) && (state === "all" || (state === "unread" ? !n.read : n.read))),
    [mine, type, state],
  );

  return (
    <>
      <PageHeader
        title={t("title")}
        description={`${t("description")} ${t("newCount", { count: unread })}.`}
        actions={
          unread > 0 && (
            <Button
              variant="outline"
              onClick={async () => {
                await notificationsRepo.markAllRead();
                feedback.success(t("allRead"));
              }}
            >
              <CheckCheck />
              {t("markAllRead")}
            </Button>
          )
        }
      />
      <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <ChoiceChips
          label={t("typeFilter")}
          value={type}
          onChange={(v) => setType(v as NotificationType | "all")}
          options={[{ value: "all", label: t("all") }, ...TYPES.map((ty) => ({ value: ty, label: t(`types.${ty}`) }))]}
        />
        <ChoiceChips
          label={t("stateFilter")}
          value={state}
          onChange={(v) => setState(v as typeof state)}
          options={[
            { value: "all", label: t("all") },
            { value: "unread", label: `${t("unread")} · ${unread}` },
            { value: "read", label: t("read") },
          ]}
        />
      </div>
      <Card className="py-2">
        <CardContent className="px-2">
          {loading ? (
            <ListSkeleton className="p-3" />
          ) : list.length === 0 ? (
            <EmptyState illustration="bell" title={mine.length ? t("emptyFiltered") : t("empty")} body={mine.length ? undefined : t("emptyBody")} />
          ) : (
            <>
              <ul className="space-y-1">
                {list.slice(0, limit).map((n) => {
                  const c = content(n);
                  return (
                    <li key={n.id}>
                      <NotificationRow
                        notification={n}
                        text={c.text}
                        onOpen={() => {
                          void notificationsRepo.markRead([n.id]);
                          router.push(c.href);
                        }}
                      />
                    </li>
                  );
                })}
              </ul>
              {list.length > limit && (
                <Button variant="ghost" className="mt-2 w-full" onClick={() => setLimit((l) => l + 40)}>
                  {t("showMore", { count: list.length - limit })}
                </Button>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </>
  );
}
