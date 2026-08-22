"use client";

import { useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import {
  REPORT_DATE_PRESETS,
  REPORT_DATE_PRESET_LABELS,
  type ReportDatePreset,
} from "@/lib/admin/report-date-range";

/**
 * §2 — preset buttons + a custom start/end date pair. Every change
 * navigates (router.push with new ?range=/&start=/&end= search params)
 * rather than holding report data in client state — the Server
 * Component page re-fetches and re-aggregates for the new range, so the
 * date filter never has to duplicate any calculation logic itself.
 */
export function ReportDateFilter({
  activePreset,
  activeStartDate,
  activeEndDate,
}: {
  activePreset: ReportDatePreset;
  activeStartDate: string | null;
  activeEndDate: string | null;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [customOpen, setCustomOpen] = useState(activePreset === "custom");
  const [start, setStart] = useState(activeStartDate ?? "");
  const [end, setEnd] = useState(activeEndDate ?? "");

  function navigate(params: Record<string, string | null>) {
    const next = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(params)) {
      if (value === null) next.delete(key);
      else next.set(key, value);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  function selectPreset(preset: ReportDatePreset) {
    if (preset === "custom") {
      setCustomOpen(true);
      return;
    }
    setCustomOpen(false);
    navigate({ range: preset, start: null, end: null });
  }

  function applyCustom() {
    if (!start || !end) return;
    navigate({ range: "custom", start, end });
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      {REPORT_DATE_PRESETS.map((preset) => {
        const selected = preset === "custom" ? customOpen || activePreset === "custom" : activePreset === preset && !customOpen;
        return (
          <button
            key={preset}
            type="button"
            onClick={() => selectPreset(preset)}
            aria-pressed={selected}
            className={`h-9 border px-3 text-xs font-semibold uppercase tracking-wide transition-colors ${
              selected ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
            }`}
          >
            {REPORT_DATE_PRESET_LABELS[preset]}
          </button>
        );
      })}

      {customOpen && (
        <div className="flex items-center gap-2">
          <input
            type="date"
            value={start}
            onChange={(e) => setStart(e.target.value)}
            aria-label="Start date"
            className="h-9 border border-line bg-background px-2 text-sm text-foreground"
          />
          <span className="text-xs text-foreground/50">to</span>
          <input
            type="date"
            value={end}
            onChange={(e) => setEnd(e.target.value)}
            aria-label="End date"
            className="h-9 border border-line bg-background px-2 text-sm text-foreground"
          />
          <button
            type="button"
            onClick={applyCustom}
            disabled={!start || !end}
            className="h-9 border border-ink bg-ink px-3 text-xs font-semibold uppercase tracking-wide text-paper disabled:cursor-not-allowed disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      )}
    </div>
  );
}
