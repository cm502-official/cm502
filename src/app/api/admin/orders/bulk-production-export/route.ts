import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserOrNull } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import {
  buildBulkProductionExportRows,
  collectBulkExportErrors,
  formatBulkProductionExportGrouped,
  formatBulkProductionExportRaw,
  type ProductionExportOrderInput,
} from "@/lib/production-export/build-export-file";
import { isOrderSafeForProductionExport } from "@/lib/production-export/order-eligibility";
import type { ProductionExportItemInput } from "@/lib/production-export/build-export-rows";

/**
 * POST /api/admin/orders/bulk-production-export (§12/§13)
 *
 * Two-phase confirmation: if any requested order isn't in the safe
 * default set (verified payment, not cancelled), the first call returns
 * `requiresConfirmation` listing exactly which ones and why, instead of
 * silently including them. Resubmitting with `includeUnsafe: true`
 * proceeds with the full original list — the admin has now explicitly
 * selected and confirmed them (§13).
 */
const requestSchema = z.object({
  orderNumbers: z.array(z.string().trim().min(1)).min(1, "กรุณาเลือกอย่างน้อย 1 คำสั่งซื้อ").max(500),
  mode: z.enum(["grouped", "raw"]).default("grouped"),
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
  const { orderNumbers, mode, includeUnsafe } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      order_number, payment_status, fulfillment_status,
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
    order_items: Array<{
      color_name_snapshot: string;
      size_name_snapshot: string;
      quantity: number;
      customizations: Array<{ name: string | null; number: string | null }> | null;
    }>;
  }>;

  const rows = rawRows.map((r) => ({
    order_number: r.order_number,
    payment_status: r.payment_status,
    fulfillment_status: r.fulfillment_status,
    order_items: r.order_items.map(
      (i): ProductionExportItemInput => ({
        colorNameSnapshot: i.color_name_snapshot,
        sizeNameSnapshot: i.size_name_snapshot,
        quantity: i.quantity,
        customizations: i.customizations,
      }),
    ),
  }));

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

  const orders: ProductionExportOrderInput[] = rows.map((r) => ({ orderNumber: r.order_number, items: r.order_items }));
  const perOrderRows = buildBulkProductionExportRows(orders);
  const blockedOrders = collectBulkExportErrors(perOrderRows);

  const grouped = formatBulkProductionExportGrouped(perOrderRows);
  const raw = formatBulkProductionExportRaw(orders);

  return NextResponse.json({
    requiresConfirmation: false,
    orderCount: orders.length,
    missingOrderNumbers: missing,
    blockedOrders,
    txt: mode === "raw" ? raw : grouped,
    groupedTxt: grouped,
    rawTxt: raw,
    perOrder: perOrderRows,
  });
}
