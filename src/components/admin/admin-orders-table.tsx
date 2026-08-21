"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatSatangAsThb } from "@/lib/money";
import { getFulfillmentStatusLabel, getPaymentStatusLabel } from "@/lib/orders/lifecycle";
import { isOrderSafeForProductionExport } from "@/lib/production-export/order-eligibility";
import type { AdminOrderSummary } from "@/lib/admin/get-admin-orders";

/** §12/§13 — bulk selection + production export from the orders list. */
export function AdminOrdersTable({ orders }: { orders: AdminOrderSummary[] }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<"grouped" | "raw">("grouped");
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<Array<{ orderNumber: string; paymentStatus: string; fulfillmentStatus: string }> | null>(null);

  const safeDefaultCount = useMemo(
    () => orders.filter((o) => isOrderSafeForProductionExport(o.paymentStatus, o.fulfillmentStatus)).length,
    [orders],
  );

  function toggle(orderNumber: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderNumber)) next.delete(orderNumber);
      else next.add(orderNumber);
      return next;
    });
  }

  function selectAllSafe() {
    setSelected(
      new Set(orders.filter((o) => isOrderSafeForProductionExport(o.paymentStatus, o.fulfillmentStatus)).map((o) => o.orderNumber)),
    );
  }

  function clearSelection() {
    setSelected(new Set());
  }

  function download(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function runExport(includeUnsafe: boolean) {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/admin/orders/bulk-production-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumbers: [...selected], mode, includeUnsafe }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) {
        setExportError(body?.error?.message ?? "Export ไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }
      if (body.requiresConfirmation) {
        setPendingConfirm(body.unsafeOrders);
        return;
      }
      setPendingConfirm(null);
      if (body.blockedOrders?.length > 0) {
        setExportError(
          `พบปัญหาในบางคำสั่งซื้อ: ${body.blockedOrders.map((b: { orderNumber: string }) => b.orderNumber).join(", ")} — ยังดาวน์โหลดรายการที่เหลือได้`,
        );
      }
      const suffix = mode === "raw" ? "raw" : "grouped";
      download(body.txt, `CM502-production-batch-${suffix}-${Date.now()}.txt`);
    } catch {
      setExportError("เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={selectAllSafe} className="underline underline-offset-4">
          เลือกทั้งหมดที่พร้อมผลิต ({safeDefaultCount})
        </button>
        <button type="button" onClick={clearSelection} className="underline underline-offset-4">
          ล้างการเลือก
        </button>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "grouped"} onChange={() => setMode("grouped")} /> มีหัวข้อ (แบ่งตามคำสั่งซื้อ)
        </label>
        <label className="flex items-center gap-1.5">
          <input type="radio" checked={mode === "raw"} onChange={() => setMode("raw")} /> ไม่มีหัวข้อ (raw)
        </label>
        <button
          type="button"
          disabled={selected.size === 0 || exporting}
          onClick={() => runExport(false)}
          className="ml-auto h-9 border border-ink bg-ink px-4 font-semibold uppercase tracking-wide text-paper disabled:cursor-not-allowed disabled:opacity-40"
        >
          {exporting ? "กำลัง Export…" : `Export รายการผลิต (${selected.size})`}
        </button>
      </div>

      {pendingConfirm && (
        <div className="border border-accent/40 bg-accent/5 p-3 text-xs">
          <p className="font-medium text-accent">
            คำสั่งซื้อต่อไปนี้ไม่อยู่ในสถานะที่พร้อมผลิตตามค่าเริ่มต้น (ยกเลิก/ยังไม่ชำระเงิน/ไม่ผ่านการตรวจสอบ) —
            ยืนยันว่าต้องการรวมเข้าไปด้วยหรือไม่?
          </p>
          <ul className="mt-2 list-disc pl-4">
            {pendingConfirm.map((o) => (
              <li key={o.orderNumber}>
                {o.orderNumber} — {getPaymentStatusLabel(o.paymentStatus)} / {getFulfillmentStatusLabel(o.fulfillmentStatus)}
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              onClick={() => runExport(true)}
              className="h-8 border border-accent px-3 font-semibold uppercase tracking-wide text-accent"
            >
              ยืนยันรวมเข้าไปด้วย
            </button>
            <button type="button" onClick={() => setPendingConfirm(null)} className="h-8 border border-line px-3 font-semibold uppercase tracking-wide">
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      {exportError && <p className="text-xs text-accent">{exportError}</p>}

      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-foreground/50">
              <th className="py-2 pr-2 font-medium"></th>
              <th className="py-2 pr-4 font-medium">Order</th>
              <th className="py-2 pr-4 font-medium">Customer</th>
              <th className="py-2 pr-4 font-medium">Phone</th>
              <th className="py-2 pr-4 font-medium">Payment</th>
              <th className="py-2 pr-4 font-medium">Fulfillment</th>
              <th className="py-2 pr-4 font-medium">Qty</th>
              <th className="py-2 pr-4 font-medium">Unit price</th>
              <th className="py-2 pr-4 font-medium">Total</th>
              <th className="py-2 font-medium">Created</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {orders.map((order) => (
              <tr key={order.orderNumber} className="border-b border-line/50">
                <td className="py-2 pr-2">
                  <input
                    type="checkbox"
                    checked={selected.has(order.orderNumber)}
                    onChange={() => toggle(order.orderNumber)}
                    aria-label={`Select order ${order.orderNumber}`}
                  />
                </td>
                <td className="py-2 pr-4">
                  <Link href={`/admin/orders/${order.orderNumber}`} className="font-medium underline underline-offset-4">
                    {order.orderNumber}
                  </Link>
                </td>
                <td className="py-2 pr-4">{order.customerName ?? "-"}</td>
                <td className="py-2 pr-4">{order.customerPhone ?? "-"}</td>
                <td className="py-2 pr-4">{getPaymentStatusLabel(order.paymentStatus)}</td>
                <td className="py-2 pr-4">{getFulfillmentStatusLabel(order.fulfillmentStatus)}</td>
                <td className="py-2 pr-4">{order.totalQuantity}</td>
                <td className="py-2 pr-4">{order.unitPriceSatang !== null ? formatSatangAsThb(order.unitPriceSatang) : "-"}</td>
                <td className="py-2 pr-4">{formatSatangAsThb(order.totalSatang)}</td>
                <td className="py-2 text-foreground/60">
                  {new Date(order.createdAt).toLocaleString("en-US", {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
