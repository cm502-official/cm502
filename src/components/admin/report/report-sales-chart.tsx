"use client";

import { useState } from "react";
import { formatSatangAsThb } from "@/lib/money";
import type { SalesOverTimeBucket } from "@/lib/admin/report-calculations";

type Metric = "revenue" | "orders" | "shirts";

const METRIC_LABELS: Record<Metric, string> = {
  revenue: "Revenue",
  orders: "Orders",
  shirts: "Shirts Sold",
};

function metricValue(bucket: SalesOverTimeBucket, metric: Metric): number {
  if (metric === "revenue") return bucket.revenueSatang;
  if (metric === "orders") return bucket.orders;
  return bucket.shirts;
}

function formatMetricValue(value: number, metric: Metric): string {
  return metric === "revenue" ? formatSatangAsThb(value) : value.toLocaleString("en-US");
}

const CHART_HEIGHT = 180;
const BAR_GAP = 4;

/**
 * §4 — a dependency-free, responsive inline-SVG bar chart. Switching the
 * metric (Revenue/Orders/Shirts) never re-fetches — all three metrics
 * are already computed server-side per bucket (report-calculations.ts),
 * this component only picks which field to plot. No animation, matches
 * §20 "ไม่ต้องใส่ animation เยอะ".
 */
export function ReportSalesChart({
  buckets,
  granularity,
}: {
  buckets: SalesOverTimeBucket[];
  granularity: "day" | "week";
}) {
  const [metric, setMetric] = useState<Metric>("revenue");

  if (buckets.length === 0) {
    return (
      <div className="border border-line p-4">
        <ChartHeader metric={metric} onChange={setMetric} granularity={granularity} />
        <p className="mt-6 py-8 text-center text-sm text-foreground/50">No paid orders found for this period.</p>
      </div>
    );
  }

  const values = buckets.map((b) => metricValue(b, metric));
  const maxValue = Math.max(...values, 1);
  const barWidth = 100 / buckets.length;
  // Avoid a wall of unreadable labels when there are many buckets — show at most ~8 evenly spaced.
  const labelStride = Math.max(1, Math.ceil(buckets.length / 8));

  return (
    <div className="border border-line p-4">
      <ChartHeader metric={metric} onChange={setMetric} granularity={granularity} />
      <div className="mt-4 w-full overflow-x-auto">
        <svg
          viewBox={`0 0 100 ${CHART_HEIGHT + 24}`}
          preserveAspectRatio="none"
          className="h-48 w-full min-w-[480px]"
          role="img"
          aria-label={`${METRIC_LABELS[metric]} over time`}
        >
          {buckets.map((bucket, index) => {
            const value = metricValue(bucket, metric);
            const barHeight = maxValue > 0 ? (value / maxValue) * CHART_HEIGHT : 0;
            const x = index * barWidth;
            return (
              <g key={bucket.date}>
                <rect
                  x={x + BAR_GAP / 2 / buckets.length}
                  y={CHART_HEIGHT - barHeight}
                  width={Math.max(0, barWidth - BAR_GAP / buckets.length)}
                  height={barHeight}
                  className="fill-ink"
                >
                  <title>
                    {bucket.date} — {formatMetricValue(value, metric)}
                  </title>
                </rect>
                {index % labelStride === 0 && (
                  <text
                    x={x + barWidth / 2}
                    y={CHART_HEIGHT + 14}
                    textAnchor="middle"
                    fontSize="3.2"
                    className="fill-foreground/50"
                  >
                    {bucket.date.slice(5)}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function ChartHeader({
  metric,
  onChange,
  granularity,
}: {
  metric: Metric;
  onChange: (m: Metric) => void;
  granularity: "day" | "week";
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
        Sales Over Time <span className="text-foreground/40">({granularity === "day" ? "daily" : "weekly"})</span>
      </h2>
      <div className="flex gap-1.5">
        {(Object.keys(METRIC_LABELS) as Metric[]).map((m) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            aria-pressed={metric === m}
            className={`h-8 border px-2.5 text-xs font-semibold uppercase tracking-wide transition-colors ${
              metric === m ? "border-ink bg-ink text-paper" : "border-line hover:border-ink"
            }`}
          >
            {METRIC_LABELS[m]}
          </button>
        ))}
      </div>
    </div>
  );
}
