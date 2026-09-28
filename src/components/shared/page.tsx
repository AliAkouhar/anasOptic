"use client";

import { ArrowLeft } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDb } from "@/data/store";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  actions,
  backHref,
  children,
  className,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  backHref?: string;
  children?: ReactNode;
  className?: string;
}) {
  const t = useTranslations("common");
  const appName = useDb((db) => db.settings.appName);
  useEffect(() => {
    if (typeof title === "string") document.title = `${title} · ${appName}`;
  }, [title, appName]);
  return (
    <div className={cn("mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between", className)}>
      <div className="min-w-0 space-y-1">
        {backHref && (
          <Button asChild variant="ghost" size="sm" className="-ml-2 mb-1 text-muted-foreground">
            <Link href={backHref}>
              <ArrowLeft />
              {t("back")}
            </Link>
          </Button>
        )}
        <h1 className="text-2xl font-semibold tracking-tight text-balance sm:text-[1.7rem]">{title}</h1>
        {description && <p className="text-sm text-muted-foreground sm:text-[0.95rem]">{description}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 sm:justify-end">{actions}</div>}
    </div>
  );
}

type Illustration = "orders" | "search" | "stock" | "bell" | "clients" | "box" | "chart";

function EmptyIllustration({ kind }: { kind: Illustration }) {
  return (
    <svg viewBox="0 0 120 96" className="h-24 w-32" aria-hidden="true">
      <ellipse cx="60" cy="86" rx="42" ry="6" className="fill-muted" />
      <rect x="22" y="14" width="76" height="62" rx="14" className="fill-accent" />
      {kind === "search" && (
        <g fill="none" strokeWidth="4" strokeLinecap="round" className="stroke-primary">
          <circle cx="54" cy="42" r="14" />
          <path d="m65 53 12 12" />
        </g>
      )}
      {(kind === "orders" || kind === "clients") && (
        <g className="fill-primary">
          <rect x="36" y="28" width="48" height="6" rx="3" opacity=".9" />
          <rect x="36" y="41" width="36" height="6" rx="3" opacity=".45" />
          <rect x="36" y="54" width="42" height="6" rx="3" opacity=".25" />
        </g>
      )}
      {(kind === "stock" || kind === "box") && (
        <g className="stroke-primary" fill="none" strokeWidth="3.5" strokeLinejoin="round">
          <path d="M40 38 60 28l20 10v22L60 70 40 60Z" />
          <path d="M40 38l20 10 20-10M60 48v22" />
        </g>
      )}
      {kind === "bell" && (
        <g className="stroke-primary" fill="none" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M46 56V44a14 14 0 0 1 28 0v12l4 5H42Z" />
          <path d="M55 65a5 5 0 0 0 10 0" />
        </g>
      )}
      {kind === "chart" && (
        <g className="fill-primary">
          <rect x="38" y="46" width="9" height="18" rx="2" opacity=".35" />
          <rect x="53" y="36" width="9" height="28" rx="2" opacity=".6" />
          <rect x="68" y="28" width="9" height="36" rx="2" />
        </g>
      )}
      <g fill="none" className="stroke-attention" strokeWidth="2.6" strokeLinecap="round">
        <circle cx="92" cy="18" r="6" />
        <circle cx="106" cy="18" r="6" />
        <path d="M98 17.5c.7-.6 1.3-.6 2 0" />
      </g>
    </svg>
  );
}

export function EmptyState({
  title,
  body,
  action,
  illustration = "search",
  className,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
  illustration?: Illustration;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center justify-center gap-3 px-6 py-12 text-center", className)}>
      <EmptyIllustration kind={illustration} />
      <div className="space-y-1">
        <p className="text-base font-semibold">{title}</p>
        {body && <p className="mx-auto max-w-sm text-sm text-muted-foreground">{body}</p>}
      </div>
      {action && <div className="pt-1">{action}</div>}
    </div>
  );
}

export function ListSkeleton({ rows = 6, className }: { rows?: number; className?: string }) {
  return (
    <div className={cn("space-y-3", className)} aria-hidden="true">
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="flex items-center gap-4">
          <Skeleton className="size-10 rounded-xl" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-3.5 w-2/5" />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="h-6 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function CardsSkeleton({ count = 4, className }: { count?: number; className?: string }) {
  return (
    <div className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-4", className)} aria-hidden="true">
      {Array.from({ length: count }, (_, i) => (
        <Skeleton key={i} className="h-32 rounded-2xl" />
      ))}
    </div>
  );
}

/** A labelled stat used in detail headers. */
export function Stat({ label, value, hint, className }: { label: string; value: ReactNode; hint?: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="num mt-1 truncate text-lg font-semibold">{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
