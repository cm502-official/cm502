import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ProductionExportItemInput } from "@/lib/production-export/build-export-rows";
import { formatManufacturerAddress } from "@/lib/production-export/build-manufacturer-address";
import {
  buildManufacturerRows,
  formatManufacturerRowsAsCsv,
  type ManufacturerRow,
} from "@/lib/production-export/build-manufacturer-rows";
import { buildManufacturerXlsxBuffer } from "@/lib/production-export/build-manufacturer-xlsx";
import type { ProductionExportRowError } from "@/lib/production-export/build-export-rows";

export interface OrderProductionExportData {
  orderNumber: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  rows: ManufacturerRow[];
  errors: ProductionExportRowError[];
  csv: string;
  /** Base64-encoded .xlsx workbook — same normalized rows as `rows`/`csv` (§18). */
  xlsxBase64: string;
  productionExportedAt: string | null;
  updatedAt: string;
  /** True if the order was edited after its last production export (§15 warning). */
  editedAfterExport: boolean;
}

/**
 * Shared data source for both the single-order preview/export route and
 * bulk export (§18 "same function for preview / download / tests") —
 * fetches one order's line items, customer, and address fresh and runs
 * them through the canonical buildManufacturerRows, so the preview table
 * and the downloaded file can never disagree (§10/§16).
 */
export async function getOrderProductionExportData(orderNumber: string): Promise<OrderProductionExportData | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      order_number, payment_status, fulfillment_status, production_exported_at, updated_at,
      customers ( full_name, phone ),
      addresses ( address_line, soi_road, subdistrict, district, province, postal_code, delivery_note ),
      order_items ( color_name_snapshot, size_name_snapshot, quantity, customizations ),
      order_edit_history ( edited_at )
    `,
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    order_number: string;
    payment_status: string;
    fulfillment_status: string;
    production_exported_at: string | null;
    updated_at: string;
    customers: { full_name: string; phone: string } | null;
    addresses: {
      address_line: string;
      soi_road: string | null;
      subdistrict: string;
      district: string;
      province: string;
      postal_code: string;
      delivery_note: string | null;
    } | null;
    order_items: Array<{
      color_name_snapshot: string;
      size_name_snapshot: string;
      quantity: number;
      customizations: Array<{ name: string | null; number: string | null }> | null;
    }>;
    order_edit_history: Array<{ edited_at: string }>;
  };

  const items: ProductionExportItemInput[] = row.order_items.map((i) => ({
    colorNameSnapshot: i.color_name_snapshot,
    sizeNameSnapshot: i.size_name_snapshot,
    quantity: i.quantity,
    customizations: i.customizations,
  }));

  const address = row.addresses
    ? formatManufacturerAddress({
        addressLine: row.addresses.address_line,
        soiRoad: row.addresses.soi_road,
        subdistrict: row.addresses.subdistrict,
        district: row.addresses.district,
        province: row.addresses.province,
        postalCode: row.addresses.postal_code,
        deliveryNote: row.addresses.delivery_note,
      })
    : "";

  const { rows, errors } = buildManufacturerRows([
    {
      orderNumber: row.order_number,
      items,
      recipient: row.customers?.full_name ?? "",
      phone: row.customers?.phone ?? "",
      address,
    },
  ]);

  // Scoped specifically to genuine admin edits (order_edit_history),
  // not just any touch of the orders row — a proof-review decision or
  // a payment-status change also bumps orders.updated_at via its
  // trigger, but neither changes what the manufacturer needs to see, so
  // neither should trigger the "re-export" warning (§15).
  const lastEditedAt = row.order_edit_history.reduce<string | null>(
    (latest, h) => (latest === null || h.edited_at > latest ? h.edited_at : latest),
    null,
  );

  const xlsxBuffer = await buildManufacturerXlsxBuffer(rows);

  return {
    orderNumber: row.order_number,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    rows,
    errors,
    csv: formatManufacturerRowsAsCsv(rows),
    xlsxBase64: xlsxBuffer.toString("base64"),
    productionExportedAt: row.production_exported_at,
    updatedAt: row.updated_at,
    editedAfterExport:
      row.production_exported_at !== null && lastEditedAt !== null && lastEditedAt > row.production_exported_at,
  };
}
