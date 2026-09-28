"use client";

import { Bell } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { EmptyState } from "@/components/shared/page";
import { NotificationRow, useNotificationContent } from "@/components/notifications/notification-item";
import { useRequiredAuth } from "@/data/hooks";
import { notificationsRepo } from "@/data/repositories";
import { useDb } from "@/data/store";
import { Link, useRouter } from "@/i18n/navigation";

export function useMyNotifications() {
  const auth = useRequiredAuth();
  const all = useDb((db) => db.notifications);
  return useMemo(
    () =>
      all
        .filter((n) => n.userId === auth.user.id)
        .sort((a, b) => Number(a.read) - Number(b.read) || b.createdAt.localeCompare(a.createdAt)),
    [all, auth.user.id],
  );
}

export function NotificationBell() {
  const t = useTranslations("notifications");
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const mine = useMyNotifications();
  const content = useNotificationContent();
  const unread = mine.filter((n) => !n.read).length;
  const latest = mine.slice(0, 8);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative rounded-full" aria-label={t("bellLabel", { count: unread })}>
          <Bell className="size-5" />
          {unread > 0 && (
            <span className="num absolute top-1 right-1 min-w-[18px] rounded-full bg-attention-strong px-1 text-center text-[10px] leading-[18px] font-bold text-attention-strong-foreground ring-2 ring-background motion-safe:animate-pop-in">
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[400px] max-w-[calc(100vw-1.5rem)] rounded-2xl p-0">
        <div className="flex items-center justify-between gap-2 border-b px-4 py-3">
          <div>
            <p className="font-semibold">{t("title")}</p>
            <p className="text-xs text-muted-foreground">{t("newCount", { count: unread })}</p>
          </div>
          {unread > 0 && (
            <Button variant="ghost" size="sm" onClick={() => void notificationsRepo.markAllRead()}>
              {t("markAllRead")}
            </Button>
          )}
        </div>
        <div className="max-h-[60dvh] overflow-y-auto p-2">
          {latest.length === 0 ? (
            <EmptyState illustration="bell" title={t("empty")} body={t("emptyBody")} className="py-8" />
          ) : (
            latest.map((n) => {
              const c = content(n);
              return (
                <NotificationRow
                  key={n.id}
                  notification={n}
                  text={c.text}
                  onOpen={() => {
                    void notificationsRepo.markRead([n.id]);
                    setOpen(false);
                    router.push(c.href);
                  }}
                />
              );
            })
          )}
        </div>
        <div className="border-t p-2">
          <Button asChild variant="ghost" className="w-full" onClick={() => setOpen(false)}>
            <Link href="/notifications">{t("title")} →</Link>
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
