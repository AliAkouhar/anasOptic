"use client";

import { ArrowDown, ArrowUp, ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslations } from "next-intl";
import { useMemo, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

export interface Column<T> {
  id: string;
  header: ReactNode;
  /** Plain-text header for the sort button's accessible name. */
  label?: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: "left" | "right" | "center";
  className?: string;
  /** Hide the column below a breakpoint. */
  hideBelow?: "lg" | "xl";
}

const HIDE: Record<NonNullable<Column<unknown>["hideBelow"]>, string> = {
  lg: "hidden lg:table-cell",
  xl: "hidden xl:table-cell",
};

/**
 * Sortable, paginated table. Below `md` it renders `mobileCard` items instead of a table so
 * phones never scroll horizontally.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  onRowClick,
  initialSort,
  pageSize = 25,
  loading,
  empty,
  mobileCard,
  caption,
  rowClassName,
  footer,
}: {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  initialSort?: { id: string; desc: boolean };
  pageSize?: number;
  loading?: boolean;
  empty?: ReactNode;
  mobileCard?: (row: T) => ReactNode;
  caption?: string;
  rowClassName?: (row: T) => string | undefined;
  footer?: ReactNode;
}) {
  const t = useTranslations("common");
  const [sort, setSort] = useState(initialSort ?? null);
  const [pageState, setPage] = useState(0);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find((c) => c.id === sort.id);
    if (!col?.sortValue) return rows;
    const get = col.sortValue;
    const withValues = rows.map((r) => [get(r), r] as const);
    withValues.sort(([a], [b]) => {
      const cmp = typeof a === "number" && typeof b === "number" ? a - b : String(a).localeCompare(String(b), undefined, { numeric: true });
      return sort.desc ? -cmp : cmp;
    });
    return withValues.map(([, r]) => r);
  }, [rows, sort, columns]);

  const pages = Math.max(1, Math.ceil(sorted.length / pageSize));
  // Filters can shrink the list under the current page: clamp instead of storing a stale page.
  const page = Math.min(pageState, pages - 1);
  const visible = sorted.slice(page * pageSize, page * pageSize + pageSize);

  const toggleSort = (id: string) =>
    setSort((s) => (s?.id === id ? (s.desc ? { id, desc: false } : null) : { id, desc: true }));

  if (loading) {
    return (
      <div className="space-y-3 p-4" aria-busy="true">
        {Array.from({ length: 8 }, (_, i) => (
          <Skeleton key={i} className="h-11 w-full rounded-xl" />
        ))}
      </div>
    );
  }
  if (rows.length === 0) return <>{empty}</>;

  return (
    <div>
      {mobileCard && (
        <ul className="divide-y md:hidden">
          {visible.map((row) => (
            <li key={rowKey(row)}>{mobileCard(row)}</li>
          ))}
        </ul>
      )}
      {/* `relative`: absolutely positioned children (sr-only labels) stay inside the scroll box. */}
      <div className={cn("relative overflow-x-auto", mobileCard && "hidden md:block")}>
        <table className="w-full text-sm">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead>
            <tr className="border-b text-left text-xs text-muted-foreground">
              {columns.map((c) => {
                const active = sort?.id === c.id;
                return (
                  <th
                    key={c.id}
                    scope="col"
                    aria-sort={active ? (sort!.desc ? "descending" : "ascending") : undefined}
                    className={cn(
                      "h-11 px-3 font-medium whitespace-nowrap first:pl-5 last:pr-5",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.hideBelow && HIDE[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.id)}
                        className={cn("-mx-1 inline-flex items-center gap-1 rounded px-1 py-1 hover:text-foreground", active && "text-foreground")}
                        aria-label={t("sortBy", { column: c.label ?? String(c.header) })}
                      >
                        {c.header}
                        {active ? sort!.desc ? <ArrowDown className="size-3.5" /> : <ArrowUp className="size-3.5" /> : <ArrowUpDown className="size-3.5 opacity-40" />}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn("border-b transition-colors last:border-0", onRowClick && "cursor-pointer hover:bg-muted/50", rowClassName?.(row))}
              >
                {columns.map((c) => (
                  <td
                    key={c.id}
                    className={cn(
                      "h-14 px-3 align-middle first:pl-5 last:pr-5",
                      c.align === "right" && "text-right",
                      c.align === "center" && "text-center",
                      c.hideBelow && HIDE[c.hideBelow],
                      c.className,
                    )}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3 sm:px-5">
        <p className="num text-sm text-muted-foreground">
          {t("pagination", { from: page * pageSize + 1, to: Math.min(sorted.length, (page + 1) * pageSize), total: sorted.length })}
        </p>
        <div className="flex items-center gap-2">
          {footer}
          <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} aria-label={t("prevPage")}>
            <ChevronLeft />
          </Button>
          <span className="num min-w-12 text-center text-sm">
            {page + 1} / {pages}
          </span>
          <Button variant="outline" size="icon-sm" onClick={() => setPage((p) => Math.min(pages - 1, p + 1))} disabled={page >= pages - 1} aria-label={t("nextPage")}>
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

/** Downloads rows as a CSV file (semicolon-separated, UTF-8 BOM for Excel). */
export function downloadCsv(filename: string, header: string[], rows: (string | number)[][]) {
  const escape = (v: string | number) => {
    const s = String(v ?? "");
    return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = "﻿" + [header, ...rows].map((r) => r.map(escape).join(";")).join("\n");
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}
