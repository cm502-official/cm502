"use client";

import { useState } from "react";
import type { AdminCatalogVariant } from "@/lib/admin/get-admin-catalog";
import type { AdminOrderDetail } from "@/lib/admin/get-admin-order-detail";
import { OrderEditForm } from "./order-edit-form";

/** §1/§6 — "แก้ไขคำสั่งซื้อ" reveals an inline edit mode (matches this admin's existing plain stacked-section layout better than a modal/drawer). */
export function OrderEditToggle({
  orderNumber,
  editable,
  paymentStatus,
  catalogVariants,
}: {
  orderNumber: string;
  editable: NonNullable<AdminOrderDetail["editable"]>;
  paymentStatus: string;
  catalogVariants: AdminCatalogVariant[];
}) {
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <OrderEditForm
        orderNumber={orderNumber}
        editable={editable}
        paymentStatus={paymentStatus}
        catalogVariants={catalogVariants}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-fit border border-ink px-4 py-2 text-xs font-semibold uppercase tracking-wide transition-colors hover:bg-ink hover:text-paper"
    >
      แก้ไขคำสั่งซื้อ
    </button>
  );
}
