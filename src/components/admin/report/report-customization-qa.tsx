"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CustomizationQaRow } from "@/lib/admin/report-calculations";

const PAGE_SIZE = 20;

function isBlank(value: string | null): boolean {
  return value === null || value.trim() === "";
}

/**
 * §10 — one row per physical shirt from Paid Orders. "Show only flagged"
 * is a client-side filter over the already-server-computed rows (no
 * re-fetch) using the same blank-name/blank-number signal §11's warning
 * count is built from. Order Number links straight into the existing
 * Admin Order Detail route (§13) — no duplicate detail view.
 */
export function ReportCustomizationQa({ rows }: { rows: CustomizationQaRow[] }) {
  const [onlyFlagged, setOnlyFlagged] = useState(false);
  const [page, setPage] = useState(1);

  const filtered = useMemo(
    () => (onlyFlagged ? rows.filter((r) => isBlank(r.customName) || isBlank(r.customNumber)) : rows),
    [rows, onlyFlagged],
  );

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  if (rows.length === 0) {
    return <p className="py-6 text-center text-sm text-foreground/50">No paid orders found for this period.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      <label className="flex w-fit items-center gap-2 text-xs font-medium">
        <input
          type="checkbox"
          checked={onlyFlagged}
          onChange={(e) => {
            setOnlyFlagged(e.target.checked);
            setPage(1);
          }}
        />
        Show only shirts with a blank name or number
      </label>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-foreground/50">
              <th className="py-2 pr-3 font-medium">Order Number</th>
              <th className="py-2 pr-3 font-medium">Customer</th>
              <th className="py-2 pr-3 font-medium">Color</th>
              <th className="py-2 pr-3 font-medium">Size</th>
              <th className="py-2 pr-3 font-medium">Custom Name</th>
              <th className="py-2 pr-3 font-medium">Custom Number</th>
              <th className="py-2 font-medium">Production Status</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-6 text-center text-xs text-foreground/50">
                  No shirts match this filter.
                </td>
              </tr>
            ) : (
              paginated.map((row, i) => (
                <tr key={`${row.orderNumber}-${pageStart + i}`} className="border-b border-line/50">
                  <td className="py-2 pr-3">
                    <Link href={`/admin/orders/${row.orderNumber}`} className="font-medium underline underline-offset-4">
                      {row.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-3">{row.customerName ?? "-"}</td>
                  <td className="py-2 pr-3">{row.colorName}</td>
                  <td className="py-2 pr-3">{row.sizeName}</td>
                  <td className={`py-2 pr-3 ${isBlank(row.customName) ? "text-accent" : ""}`}>{row.customName ?? "-"}</td>
                  <td className={`py-2 pr-3 ${isBlank(row.customNumber) ? "text-accent" : ""}`}>{row.customNumber ?? "-"}</td>
                  <td className="py-2">{row.productionStatus}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/60">
          <span>
            Showing {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} of {filtered.length} shirts
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={clampedPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 border border-line px-3 font-semibold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
            >
              Prev
            </button>
            <span>
              Page {clampedPage} / {pageCount}
            </span>
            <button
              type="button"
              disabled={clampedPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="h-8 border border-line px-3 font-semibold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
