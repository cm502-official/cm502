import Link from "next/link";
import { getCustomizationWarningLabel, type CustomizationWarning } from "@/lib/admin/report-calculations";

/**
 * §11 — "N shirts require attention", expandable to the exact list via a
 * native <details> (no client JS needed for "กดเพื่อดูรายการที่ผิดได้").
 * Purely informational — nothing here edits any order; the admin fixes
 * it themselves via the linked Order Detail page (existing route, §13).
 */
export function ReportCustomizationWarningBanner({ warnings }: { warnings: CustomizationWarning[] }) {
  if (warnings.length === 0) {
    return (
      <p className="border border-line p-3 text-sm text-foreground/60">
        No customization issues found in this period.
      </p>
    );
  }

  return (
    <details className="border border-accent/40 bg-accent/5">
      <summary className="cursor-pointer list-none p-3 text-sm font-semibold text-accent">
        {warnings.length} shirt{warnings.length === 1 ? "" : "s"} require attention
      </summary>
      <div className="overflow-x-auto border-t border-accent/30 p-3">
        <table className="w-full min-w-[560px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-foreground/50">
              <th className="py-1.5 pr-3 font-medium">Order Number</th>
              <th className="py-1.5 pr-3 font-medium">Color</th>
              <th className="py-1.5 pr-3 font-medium">Size</th>
              <th className="py-1.5 pr-3 font-medium">Shirt #</th>
              <th className="py-1.5 font-medium">Issue</th>
            </tr>
          </thead>
          <tbody>
            {warnings.map((w, i) => (
              <tr key={`${w.orderNumber}-${w.shirtIndex}-${w.reason}-${i}`} className="border-b border-line/50">
                <td className="py-1.5 pr-3">
                  <Link href={`/admin/orders/${w.orderNumber}`} className="font-medium underline underline-offset-4">
                    {w.orderNumber}
                  </Link>
                </td>
                <td className="py-1.5 pr-3">{w.colorName}</td>
                <td className="py-1.5 pr-3">{w.sizeName}</td>
                <td className="py-1.5 pr-3">{w.shirtIndex === 0 ? "—" : w.shirtIndex}</td>
                <td className="py-1.5">{getCustomizationWarningLabel(w.reason)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </details>
  );
}
