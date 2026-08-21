"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { OrderProductionExportData } from "@/lib/admin/get-order-production-export-data";

/**
 * §7/§11/§14/§15/§16 — single-order production export: preview table
 * (built from the exact same rows the TXT download uses, §16/§18),
 * TXT/CSV download, and "mark as sent to production" with re-export and
 * edited-after-export warnings.
 */
export function ProductionExportPanel({ orderNumber, data }: { orderNumber: string; data: OrderProductionExportData }) {
  const router = useRouter();
  const [marking, setMarking] = useState(false);
  const [markError, setMarkError] = useState<string | null>(null);

  function download(content: string, extension: "txt" | "csv") {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${orderNumber}-production.${extension}`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function markExported() {
    setMarking(true);
    setMarkError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/production-export`, { method: "POST" });
      if (!res.ok) {
        setMarkError("บันทึกสถานะไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        setMarking(false);
        return;
      }
      router.refresh();
    } catch {
      setMarkError("เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง");
    } finally {
      setMarking(false);
    }
  }

  const blocked = data.errors.length > 0;

  return (
    <div className="flex flex-col gap-3 border border-line p-4">
      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">Export สำหรับร้านผลิตเสื้อ</h2>

      {data.productionExportedAt ? (
        <p className="text-xs text-foreground/60">
          เคย Export แล้ว — {new Date(data.productionExportedAt).toLocaleString("th-TH")}
        </p>
      ) : (
        <p className="text-xs text-foreground/40">ยังไม่เคย Export</p>
      )}
      {data.editedAfterExport && (
        <p role="alert" className="border border-accent/40 bg-accent/5 p-2 text-xs text-accent">
          คำสั่งซื้อนี้ถูกแก้ไขหลัง Export ล่าสุด กรุณา Export ใหม่
        </p>
      )}

      {blocked && (
        <div className="border border-accent/40 bg-accent/5 p-2 text-xs text-accent">
          {data.errors.map((e, i) => (
            <p key={i}>{e.message}</p>
          ))}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[420px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-foreground/50">
              <th className="py-1.5 pr-3 font-medium">#</th>
              <th className="py-1.5 pr-3 font-medium">Color</th>
              <th className="py-1.5 pr-3 font-medium">Size</th>
              <th className="py-1.5 pr-3 font-medium">Name</th>
              <th className="py-1.5 font-medium">Number</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {data.rows.map((r) => (
              <tr key={r.sequence} className="border-b border-line/50">
                <td className="py-1.5 pr-3">{r.sequence}</td>
                <td className="py-1.5 pr-3">{r.color}</td>
                <td className="py-1.5 pr-3">{r.size}</td>
                <td className="py-1.5 pr-3">{r.name}</td>
                <td className="py-1.5">{r.number}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={blocked}
          onClick={() => download(data.txt, "txt")}
          className="h-10 border border-ink bg-ink px-4 text-xs font-semibold uppercase tracking-wide text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-40"
        >
          ดาวน์โหลด TXT
        </button>
        <button
          type="button"
          disabled={blocked}
          onClick={() => download(data.csv, "csv")}
          className="h-10 border border-line px-4 text-xs font-semibold uppercase tracking-wide hover:border-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          ดาวน์โหลด CSV
        </button>
        <button
          type="button"
          disabled={marking}
          onClick={markExported}
          className="h-10 border border-line px-4 text-xs font-semibold uppercase tracking-wide hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          {marking ? "กำลังบันทึก…" : "ทำเครื่องหมายว่าส่งเข้าผลิตแล้ว"}
        </button>
      </div>
      {markError && <p className="text-xs text-accent">{markError}</p>}
    </div>
  );
}
