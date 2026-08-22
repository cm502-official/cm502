"use client";

import { useState } from "react";
import { ColorSizeTable } from "./color-size-table";
import type { ProductionFilter, ProductionSummary, ColorSizeMatrix } from "@/lib/admin/report-calculations";

const FILTER_LABELS: Record<ProductionFilter, string> = {
  all: "All Paid",
  not_sent: "Not Sent to Production",
  sent: "Sent to Production",
};

/**
 * §8/§9 — Production Summary numbers (static, always all three) plus a
 * Color × Size table that switches between All Paid / Sent / Not Sent
 * (§9). All three matrices are precomputed server-side
 * (report-calculations.ts) and passed down together, so switching the
 * filter is instant client-side state — no re-fetch, no server round
 * trip (§17).
 */
export function ReportProductionPanel({
  summary,
  matrices,
}: {
  summary: ProductionSummary;
  matrices: Record<ProductionFilter, ColorSizeMatrix>;
}) {
  const [filter, setFilter] = useState<ProductionFilter>("all");

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatTile label="Paid Shirts" value={summary.paidShirts} sub={`${summary.paidOrders} orders`} />
        <StatTile label="Sent to Production" value={summary.sentShirts} sub={`${summary.sentOrders} orders`} />
        <StatTile label="Not Sent to Production" value={summary.notSentShirts} sub={`${summary.notSentOrders} orders`} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABELS) as ProductionFilter[]).map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            aria-pressed={filter === f}
            className={`h-8 border px-2.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              filter === f ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
            }`}
          >
            {FILTER_LABELS[f]}
          </button>
        ))}
      </div>

      <ColorSizeTable matrix={matrices[filter]} />
    </div>
  );
}

function StatTile({ label, value, sub }: { label: string; value: number; sub: string }) {
  return (
    <div className="border border-line p-3">
      <p className="text-xs uppercase tracking-wide text-foreground/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value.toLocaleString("en-US")}</p>
      <p className="text-xs text-foreground/40">{sub}</p>
    </div>
  );
}
