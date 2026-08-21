import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserOrNull } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { formatManufacturerAddress } from "@/lib/production-export/build-manufacturer-address";
import {
  buildManufacturerRows,
  collectManufacturerExportErrors,
  formatManufacturerRowsAsCsv,
  type ManufacturerOrderInput,
} from "@/lib/production-export/build-manufacturer-rows";
import { buildManufacturerXlsxBuffer } from "@/lib/production-export/build-manufacturer-xlsx";
import { isOrderSafeForProductionExport } from "@/lib/production-export/order-eligibility";
import type { ProductionExportItemInput } from "@/lib/production-export/build-export-rows";

/**
 * POST /api/admin/orders/bulk-production-export (§1/§7/§8/§12/§13)
 *
 * Two-phase confirmation: if any requested order isn't in the safe
 * default set (verified payment, not cancelled), the first call returns
 * `requiresConfirmation` listing exactly which ones and why, instead of
 * silently including them. Resubmitting with `includeUnsafe: true`
 * proceeds with the full original list — the admin has now explicitly
 * selected and confirmed them (§13).
 *
 * One order = one shipping-address block (§1): shirts from the same
 * order are always kept contiguous, and only the first physical shirt
 * row of each order carries Recipient/Phone/Address (§7) — never
 * interleaved across orders (§7 "never allow an address from one order
 * to spill into another").
 */
const requestSchema = z.object({
  orderNumbers: z.array(z.string().trim().min(1)).min(1, "กรุณาเลือกอย่างน้อย 1 คำสั่งซื้อ").max(500),
  includeUnsafe: z.boolean().optional().default(false),
});

export async function POST(request: Request) {
  const admin = await getAdminUserOrNull();
  if (!admin) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "ไม่มีสิทธิ์ดำเนินการนี้" } }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "คำขอไม่ถูกต้อง" } }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(
      { error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0]?.message ?? "คำขอไม่ถูกต้อง" } },
      { status: 400 },
    );
  }
  const { orderNumbers, includeUnsafe } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      order_number, payment_status, fulfillment_status,
      customers ( full_name, phone ),
      addresses ( address_line, soi_road, subdistrict, district, province, postal_code, delivery_note ),
      order_items ( color_name_snapshot, size_name_snapshot, quantity, customizations )
    `,
    )
    .in("order_number", orderNumbers);

  if (error) {
    console.error("[admin/bulk-production-export] fetch failed:", error);
    return NextResponse.json({ error: { code: "FETCH_FAILED", message: "ดึงข้อมูลคำสั่งซื้อไม่สำเร็จ" } }, { status: 502 });
  }

  const rawRows = (data ?? []) as unknown as Array<{
    order_number: string;
    payment_status: string;
    fulfillment_status: string;
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
  }>;

  const byOrderNumber = new Map(rawRows.map((r) => [r.order_number, r]));
  // §8 — preserve the caller's selected-order sequence rather than
  // whatever order the database happened to return rows in.
  const rows = orderNumbers.map((n) => byOrderNumber.get(n)).filter((r): r is (typeof rawRows)[number] => r != null);

  const foundNumbers = new Set(rows.map((r) => r.order_number));
  const missing = orderNumbers.filter((n) => !foundNumbers.has(n));

  if (!includeUnsafe) {
    const unsafe = rows.filter((r) => !isOrderSafeForProductionExport(r.payment_status, r.fulfillment_status));
    if (unsafe.length > 0) {
      return NextResponse.json({
        requiresConfirmation: true,
        unsafeOrders: unsafe.map((r) => ({
          orderNumber: r.order_number,
          paymentStatus: r.payment_status,
          fulfillmentStatus: r.fulfillment_status,
        })),
      });
    }
  }

  const orders: ManufacturerOrderInput[] = rows.map((r) => {
    const items: ProductionExportItemInput[] = r.order_items.map((i) => ({
      colorNameSnapshot: i.color_name_snapshot,
      sizeNameSnapshot: i.size_name_snapshot,
      quantity: i.quantity,
      customizations: i.customizations,
    }));
    const address = r.addresses
      ? formatManufacturerAddress({
          addressLine: r.addresses.address_line,
          soiRoad: r.addresses.soi_road,
          subdistrict: r.addresses.subdistrict,
          district: r.addresses.district,
          province: r.addresses.province,
          postalCode: r.addresses.postal_code,
          deliveryNote: r.addresses.delivery_note,
        })
      : "";

    return {
      orderNumber: r.order_number,
      items,
      recipient: r.customers?.full_name ?? "",
      phone: r.customers?.phone ?? "",
      address,
    };
  });

  const { rows: manufacturerRows, perOrder } = buildManufacturerRows(orders);
  const blockedOrders = collectManufacturerExportErrors(perOrder);

  const xlsxBuffer = await buildManufacturerXlsxBuffer(manufacturerRows);

  return NextResponse.json({
    requiresConfirmation: false,
    orderCount: orders.length,
    missingOrderNumbers: missing,
    blockedOrders,
    rows: manufacturerRows,
    csv: formatManufacturerRowsAsCsv(manufacturerRows),
    xlsxBase64: xlsxBuffer.toString("base64"),
  });
}
