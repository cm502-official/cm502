"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { base64ToBlob, downloadBlob } from "@/lib/admin/download-blob";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

/** §14 — Report Export (summary of the selected period), distinct from the manufacturer/vendor production export panel elsewhere in admin. */
export function ReportExportButton() {
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleExport(format: "xlsx" | "csv") {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/report/export?${searchParams.toString()}`);
      if (!res.ok) {
        setError("Export ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }
      const body = await res.json();
      const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      if (format === "xlsx") {
        downloadBlob(base64ToBlob(body.xlsxBase64, XLSX_MIME), `CM502-report-${stamp}.xlsx`);
      } else {
        downloadBlob(new Blob([body.csv], { type: "text/csv;charset=utf-8" }), `CM502-report-${stamp}.csv`);
      }
    } catch {
      setError("เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={loading}
        onClick={() => handleExport("xlsx")}
        className="h-9 border border-ink bg-ink px-3 text-xs font-semibold uppercase tracking-wide text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {loading ? "Exporting…" : "Export Report (XLSX)"}
      </button>
      <button
        type="button"
        disabled={loading}
        onClick={() => handleExport("csv")}
        className="h-9 border border-line px-3 text-xs font-semibold uppercase tracking-wide hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
      >
        CSV
      </button>
      {error && <p className="text-xs text-accent">{error}</p>}
    </div>
  );
}
