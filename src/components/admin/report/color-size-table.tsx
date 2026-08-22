import type { ColorSizeMatrix } from "@/lib/admin/report-calculations";

/**
 * §7/§9 — the Color × Size cross-tab, reused unfiltered (§7) and inside
 * the filterable Production panel (§9) with the same rendering so the
 * two never visually drift. Horizontal scroll on narrow viewports (§20)
 * instead of squeezing columns.
 */
export function ColorSizeTable({ matrix }: { matrix: ColorSizeMatrix }) {
  if (matrix.grandTotal === 0) {
    return <p className="py-6 text-center text-sm text-foreground/50">No paid orders found for this period.</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[420px] text-left text-sm">
        <thead>
          <tr className="border-b border-line text-xs uppercase tracking-wide text-foreground/50">
            <th className="py-2 pr-4 font-medium">Color</th>
            {matrix.sizes.map((size) => (
              <th key={size} className="py-2 pr-4 text-right font-medium">
                {size}
              </th>
            ))}
            <th className="py-2 text-right font-medium">Total</th>
          </tr>
        </thead>
        <tbody className="tabular-nums">
          {matrix.colors.map((color) => (
            <tr key={color} className="border-b border-line/50">
              <td className="py-2 pr-4 font-medium">{color}</td>
              {matrix.sizes.map((size) => (
                <td key={size} className="py-2 pr-4 text-right">
                  {matrix.cells[color]?.[size] ?? 0}
                </td>
              ))}
              <td className="py-2 text-right font-semibold">{matrix.rowTotals[color] ?? 0}</td>
            </tr>
          ))}
          <tr className="font-semibold">
            <td className="py-2 pr-4">Total</td>
            {matrix.sizes.map((size) => (
              <td key={size} className="py-2 pr-4 text-right">
                {matrix.colTotals[size] ?? 0}
              </td>
            ))}
            <td className="py-2 text-right">{matrix.grandTotal}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}
