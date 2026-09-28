"use client";

import { Award, Building2, FlaskConical, FormInput, ListChecks, ShieldCheck, Users } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageHeader } from "@/components/shared/page";
import { useCan } from "@/data/hooks";
import { useRouter } from "@/i18n/navigation";
import type { PermissionKey } from "@/lib/permissions";
import { FieldsTab } from "./fields-tab";
import { ListsTab } from "./lists-tab";
import { LocationsTab } from "./locations-tab";
import { DemoTab, LoyaltyTab } from "./misc-tabs";
import { RolesTab } from "./roles-tab";
import { UsersTab } from "./users-tab";

const TABS = [
  { id: "lists", icon: ListChecks, permission: "settings.manage", Component: ListsTab },
  { id: "fields", icon: FormInput, permission: "settings.manage", Component: FieldsTab },
  { id: "locations", icon: Building2, permission: "settings.manage", Component: LocationsTab },
  { id: "users", icon: Users, permission: "users.manage", Component: UsersTab },
  { id: "roles", icon: ShieldCheck, permission: "roles.manage", Component: RolesTab },
  { id: "loyalty", icon: Award, permission: "settings.manage", Component: LoyaltyTab },
  { id: "demo", icon: FlaskConical, permission: "settings.manage", Component: DemoTab },
] as const satisfies readonly { id: string; permission: PermissionKey; icon: unknown; Component: unknown }[];

type TabId = (typeof TABS)[number]["id"];

export function SettingsPage() {
  const t = useTranslations("settings");
  const can = useCan();
  const router = useRouter();
  const search = useSearchParams();
  const tabs = TABS.filter((tab) => can(tab.permission));
  const requested = search.get("tab") as TabId | null;
  const current = tabs.find((tab) => tab.id === requested)?.id ?? tabs[0]?.id;

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Tabs
        value={current}
        onValueChange={(v) => router.replace({ pathname: "/settings", query: { tab: v } }, { scroll: false })}
        orientation="vertical"
        className="flex-col gap-6 lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start"
      >
        <div className="-mx-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:sticky lg:top-24">
          <TabsList className="h-auto! w-max flex-row gap-1 bg-transparent p-0 lg:w-full lg:flex-col lg:items-stretch">
            {tabs.map(({ id, icon: Icon }) => (
              <TabsTrigger
                key={id}
                value={id}
                className="h-10 justify-start gap-2 rounded-xl px-3 text-left data-active:bg-card data-active:shadow-soft pointer-coarse:h-11"
              >
                <Icon aria-hidden="true" />
                {t(`tabs.${id}`)}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>
        {tabs.map(({ id, Component }) => (
          <TabsContent key={id} value={id} className="mt-0 min-w-0">
            <Component />
          </TabsContent>
        ))}
      </Tabs>
    </>
  );
}
