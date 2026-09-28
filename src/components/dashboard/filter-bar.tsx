"use client";

import { CalendarRange, Check, ChevronDown, MapPin } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import type { DateRange as DayRange } from "react-day-picker";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useFormat } from "@/data/hooks";
import { dateLocales } from "@/lib/format";
import type { Comparison, DateRange } from "@/lib/calculations";
import type { ID, Location } from "@/lib/types";
import { cn } from "@/lib/utils";
import type { Preset } from "./use-dashboard";

const PRESETS: Preset[] = ["today", "last7", "thisMonth", "lastMonth", "thisYear", "custom"];

export function DashboardFilters({
  preset,
  onPreset,
  custom,
  onCustom,
  range,
  prevRange,
  locations,
  locationIds,
  onLocations,
  comparison,
  onComparison,
}: {
  preset: Preset;
  onPreset: (p: Preset) => void;
  custom?: DateRange;
  onCustom: (r: DateRange) => void;
  range: DateRange;
  prevRange: DateRange | null;
  locations: Location[];
  locationIds: ID[];
  onLocations: (ids: ID[]) => void;
  comparison: Comparison;
  onComparison: (c: Comparison) => void;
}) {
  const t = useTranslations("dashboard.filters");
  const tc = useTranslations("common");
  const f = useFormat();
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [draft, setDraft] = useState<DayRange | undefined>(custom ? { from: custom.from, to: custom.to } : undefined);
  const all = locationIds.length === locations.length;
  const locationLabel = all ? t("allLocations") : locationIds.length === 1 ? (locations.find((l) => l.id === locationIds[0])?.name ?? "") : t("nLocations", { count: locationIds.length });
  const fmtRange = (r: DateRange) =>
    r.from.toDateString() === r.to.toDateString() ? f.date(r.from) : t("rangeLabel", { from: f.date(r.from, "d MMM"), to: f.date(r.to, "d MMM yyyy") });

  const pickPreset = (p: Preset) => {
    if (p === "custom") setCalendarOpen(true);
    else onPreset(p);
  };

  return (
    <div className="z-20 -mx-4 mb-6 border-b md:sticky md:top-16 bg-background/90 px-4 py-3 backdrop-blur supports-backdrop-filter:bg-background/75 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
      <div className="flex flex-wrap items-center gap-2">
        <Popover open={calendarOpen} onOpenChange={setCalendarOpen}>
          {/* Period: chips on wide screens, a select on phones; the custom-range calendar opens under them. */}
          <PopoverAnchor asChild>
            <div className="w-full sm:w-auto">
              <div className="hidden flex-wrap gap-1.5 xl:flex" role="group" aria-label={t("period")}>
                {PRESETS.map((p) => (
                  <Button
                    key={p}
                    size="sm"
                    variant={preset === p ? "default" : "outline"}
                    className="rounded-full"
                    aria-pressed={preset === p}
                    onClick={() => pickPreset(p)}
                  >
                    {p === "custom" && <CalendarRange />}
                    {t(p)}
                  </Button>
                ))}
              </div>
              <Select value={preset} onValueChange={(v) => pickPreset(v as Preset)}>
                <SelectTrigger className="w-full sm:w-44 xl:hidden" aria-label={t("period")}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PRESETS.map((p) => (
                    <SelectItem key={p} value={p}>
                      {t(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </PopoverAnchor>
          <PopoverContent align="start" className="w-auto p-2">
            <Calendar
              mode="range"
              numberOfMonths={2}
              locale={dateLocales[f.lang]}
              selected={draft}
              onSelect={setDraft}
              disabled={{ after: new Date() }}
              defaultMonth={draft?.from ?? range.from}
            />
            <div className="flex justify-end border-t p-2">
              <Button
                size="sm"
                disabled={!draft?.from}
                onClick={() => {
                  if (!draft?.from) return;
                  onCustom({ from: draft.from, to: draft.to ?? draft.from });
                  onPreset("custom");
                  setCalendarOpen(false);
                }}
              >
                {t("apply")}
              </Button>
            </div>
          </PopoverContent>
        </Popover>

        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="min-w-0 flex-1 justify-between sm:flex-none" aria-label={t("locations")}>
              <MapPin className="text-muted-foreground" />
              <span className="truncate">{locationLabel}</span>
              <ChevronDown className="opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-1">
            <button
              type="button"
              className="flex w-full items-center gap-2 rounded-lg px-2 py-2 text-left text-sm hover:bg-muted"
              onClick={() => onLocations(locations.map((l) => l.id))}
            >
              <Check className={cn("size-4", all ? "opacity-100" : "opacity-0")} />
              {t("allLocations")}
            </button>
            <div className="my-1 h-px bg-border" />
            {locations.map((l) => {
              const checked = locationIds.includes(l.id);
              return (
                <label key={l.id} className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-2 text-sm hover:bg-muted">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(v) => {
                      const next = v ? [...locationIds, l.id] : locationIds.filter((id) => id !== l.id);
                      if (next.length) onLocations(locations.filter((x) => next.includes(x.id)).map((x) => x.id));
                    }}
                  />
                  {l.name}
                </label>
              );
            })}
          </PopoverContent>
        </Popover>

        <ToggleGroup
          type="single"
          variant="outline"
          spacing={0}
          value={comparison}
          onValueChange={(v) => v && onComparison(v as Comparison)}
          aria-label={t("compare")}
          className="ml-auto"
        >
          <ToggleGroupItem value="mom" className="h-10 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground pointer-coarse:h-11">
            {t("mom")}
          </ToggleGroupItem>
          <ToggleGroupItem value="yoy" className="h-10 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground pointer-coarse:h-11">
            {t("yoy")}
          </ToggleGroupItem>
          <ToggleGroupItem value="none" className="h-10 px-3 data-[state=on]:bg-primary data-[state=on]:text-primary-foreground pointer-coarse:h-11">
            {t("none")}
          </ToggleGroupItem>
        </ToggleGroup>
      </div>
      <p className="num mt-2 text-xs text-muted-foreground">
        {fmtRange(range)}
        {prevRange && (
          <>
            {"  ·  "}
            {t(comparison)}{tc("colon")} {fmtRange(prevRange)}
          </>
        )}
      </p>
    </div>
  );
}
