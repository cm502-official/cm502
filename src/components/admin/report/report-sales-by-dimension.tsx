import type { SalesByDimensionRow } from "@/lib/admin/report-calculations";

/** §5/§6 — shared list rendering for both "Sales by Color" and "Sales by Size" (identical shape, just a different heading/data source). */
export function ReportSalesByDimension({ title, rows }: { title: string; rows: SalesByDimensionRow[] }) {
  return (
    <div className="border border-line p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-4 py-4 text-center text-sm text-foreground/50">No paid orders found for this period.</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <li key={row.name} className="flex items-center gap-3 text-sm">
              <span className="w-20 flex-none font-medium">{row.name}</span>
              <span className="h-2 flex-1 bg-paper-dim">
                <span className="block h-2 bg-ink" style={{ width: `${Math.min(100, row.percent)}%` }} />
              </span>
              <span className="w-28 flex-none text-right tabular-nums text-foreground/70">
                {row.shirts.toLocaleString("en-US")} shirts — {row.percent}%
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
