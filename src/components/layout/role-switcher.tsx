"use client";

import { Check, ChevronDown, FlaskConical } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useFeedback } from "@/components/shared/feedback";
import { useLabels, useRequiredAuth } from "@/data/hooks";
import { useDb, useSession } from "@/data/store";
import { useRouter } from "@/i18n/navigation";
import { initials } from "@/lib/format";
import { homePath, resolveAuthUser } from "@/lib/permissions";
import { cn } from "@/lib/utils";

/** Demo only: switch between users live to show what each role sees. */
export function useSwitchUser() {
  const t = useTranslations("shell");
  const router = useRouter();
  const feedback = useFeedback();
  const users = useDb((db) => db.users);
  const roles = useDb((db) => db.roles);
  return (userId: string) => {
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    useSession.getState().signIn(userId);
    router.push(homePath(resolveAuthUser(user, roles)));
    feedback.success(t("switchedTo", { name: user.fullName }));
  };
}

export function RoleSwitcher({ compact }: { compact?: boolean }) {
  const t = useTranslations("shell");
  const auth = useRequiredAuth();
  const users = useDb((db) => db.users);
  const roles = useDb((db) => db.roles);
  const labels = useLabels();
  const switchUser = useSwitchUser();

  const groups = useMemo(
    () =>
      roles
        .map((role) => ({ role, users: users.filter((u) => u.roleId === role.id && u.isActive) }))
        .filter((g) => g.users.length > 0),
    [roles, users],
  );

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={compact ? "icon" : "default"}
          className={cn("gap-2 rounded-full border-dashed border-attention/50 bg-attention/5", !compact && "pr-3 pl-2")}
          aria-label={t("switchUser")}
        >
          <span className="inline-flex items-center gap-1 rounded-full bg-attention-strong px-2 py-0.5 text-[10px] font-bold tracking-wide text-attention-strong-foreground uppercase">
            <FlaskConical className="size-3" aria-hidden="true" />
            {!compact && t("demo")}
          </span>
          {!compact && (
            <>
              <span className="max-w-32 truncate text-sm">{labels.localized(auth.role)}</span>
              <ChevronDown className="size-4 text-muted-foreground" />
            </>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 rounded-xl">
        <DropdownMenuLabel className="space-y-0.5">
          <p className="font-semibold">{t("switchUser")}</p>
          <p className="text-xs font-normal text-muted-foreground">{t("switchUserHint")}</p>
        </DropdownMenuLabel>
        {groups.map(({ role, users: members }) => (
          <DropdownMenuGroup key={role.id}>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground uppercase">{labels.localized(role)}</DropdownMenuLabel>
            {members.map((u) => (
              <DropdownMenuItem key={u.id} onSelect={() => switchUser(u.id)} className="gap-3 py-2">
                <Avatar className="size-8">
                  <AvatarFallback className="bg-accent text-xs font-semibold text-accent-foreground">{initials(u.fullName)}</AvatarFallback>
                </Avatar>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{u.fullName}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {u.locationId ? labels.location(u.locationId) : t("noLocation")}
                    {u.invitedAt ? ` · ${t("invited")}` : ""}
                  </span>
                </span>
                {u.id === auth.user.id && <Check className="size-4 text-primary" />}
              </DropdownMenuItem>
            ))}
          </DropdownMenuGroup>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
