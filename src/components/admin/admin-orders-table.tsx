"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { formatSatangAsThb } from "@/lib/money";
import { getFulfillmentStatusLabel, getPaymentStatusLabel } from "@/lib/orders/lifecycle";
import { isOrderSafeForProductionExport } from "@/lib/production-export/order-eligibility";
import { filterAdminOrders } from "@/lib/admin/filter-admin-orders";
import { base64ToBlob, downloadBlob } from "@/lib/admin/download-blob";
import type { AdminOrderSummary } from "@/lib/admin/get-admin-orders";

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PAGE_SIZE = 20;

function productionExportFilename(): string {
  const stamp = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  return `CM502-production-${stamp}.xlsx`;
}

/** §7/§8/§11/§12/§13 — search + pagination over the orders list, plus bulk selection and manufacturer XLSX export. */
export function AdminOrdersTable({ orders }: { orders: AdminOrderSummary[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<Array<{ orderNumber: string; paymentStatus: string; fulfillmentStatus: string }> | null>(null);

  const safeDefaultCount = useMemo(
    () => orders.filter((o) => isOrderSafeForProductionExport(o.paymentStatus, o.fulfillmentStatus)).length,
    [orders],
  );

  const filtered = useMemo(() => filterAdminOrders(orders, search), [orders, search]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const clampedPage = Math.min(page, pageCount);
  const pageStart = (clampedPage - 1) * PAGE_SIZE;
  const paginated = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  function updateSearch(value: string) {
    setSearch(value);
    setPage(1); // §11 — a new search always starts back at page 1
  }

  function toggle(orderNumber: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(orderNumber)) next.delete(orderNumber);
      else next.add(orderNumber);
      return next;
    });
  }

  function selectAllSafe() {
    // Deliberately selects from the FULL order list, not just the
    // current search/page — production export is a global action, and
    // search here is only a browsing aid.
    setSelected(
      new Set(orders.filter((o) => isOrderSafeForProductionExport(o.paymentStatus, o.fulfillmentStatus)).map((o) => o.orderNumber)),
    );
  }

  function clearSelection() {
    setSelected(new Set());
  }

  async function runExport(includeUnsafe: boolean) {
    setExporting(true);
    setExportError(null);
    try {
      const res = await fetch("/api/admin/orders/bulk-production-export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumbers: [...selected], includeUnsafe }),
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
      downloadBlob(base64ToBlob(body.xlsxBase64, XLSX_MIME), productionExportFilename());
    } catch {
      setExportError("เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <input
        type="search"
        value={search}
        onChange={(e) => updateSearch(e.target.value)}
        placeholder="ค้นหาเลขออเดอร์ ชื่อ เบอร์โทร หรืออีเมล"
        aria-label="ค้นหาคำสั่งซื้อ"
        className="h-10 w-full max-w-md border border-line bg-background px-3 text-sm text-foreground placeholder:text-foreground/40 focus:border-ink focus:outline-none sm:max-w-sm"
      />

      <div className="flex flex-wrap items-center gap-3 text-xs">
        <button type="button" onClick={selectAllSafe} className="underline underline-offset-4">
          เลือกทั้งหมดที่พร้อมผลิต ({safeDefaultCount})
        </button>
        <button type="button" onClick={clearSelection} className="underline underline-offset-4">
          ล้างการเลือก
        </button>
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
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-6 text-center text-xs text-foreground/50">
                  ไม่พบคำสั่งซื้อที่ตรงกับการค้นหา
                </td>
              </tr>
            ) : (
              paginated.map((order) => (
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
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > 0 && (
        <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/60">
          <span>
            แสดง {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, filtered.length)} จาก {filtered.length} รายการ
          </span>
          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              disabled={clampedPage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="h-8 border border-line px-3 font-semibold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
            >
              ก่อนหน้า
            </button>
            <span>
              หน้า {clampedPage} / {pageCount}
            </span>
            <button
              type="button"
              disabled={clampedPage >= pageCount}
              onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
              className="h-8 border border-line px-3 font-semibold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-40"
            >
              ถัดไป
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
