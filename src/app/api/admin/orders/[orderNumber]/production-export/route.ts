import { NextResponse } from "next/server";
import { getAdminUserOrNull } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { getOrderProductionExportData } from "@/lib/admin/get-order-production-export-data";

/**
 * GET  /api/admin/orders/[orderNumber]/production-export — preview data
 *      (rows + ready-to-download txt/csv), used for both the preview
 *      table (§16) and the actual download so they can never disagree
 *      (§18 — both come from the same buildProductionExportRows call).
 * POST /api/admin/orders/[orderNumber]/production-export — marks the
 *      order "ส่งเข้าผลิตแล้ว" (§14). Re-export is always allowed (§15) —
 *      this just records who/when most recently, it never blocks a
 *      later GET/download.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const admin = await getAdminUserOrNull();
  if (!admin) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "ไม่มีสิทธิ์ดำเนินการนี้" } }, { status: 401 });
  }

  const { orderNumber } = await params;
  const data = await getOrderProductionExportData(orderNumber);
  if (!data) {
    return NextResponse.json({ error: { code: "ORDER_NOT_FOUND", message: "ไม่พบคำสั่งซื้อนี้" } }, { status: 404 });
  }

  return NextResponse.json(data);
}

export async function POST(_request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const admin = await getAdminUserOrNull();
  if (!admin) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "ไม่มีสิทธิ์ดำเนินการนี้" } }, { status: 401 });
  }

  const { orderNumber } = await params;
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .update({ production_exported_at: new Date().toISOString(), production_exported_by: admin.id })
    .eq("order_number", orderNumber)
    .select("order_number, production_exported_at")
    .maybeSingle();

  if (error) {
    console.error("[admin/production-export] mark-exported failed:", error);
    return NextResponse.json({ error: { code: "UPDATE_FAILED", message: "บันทึกสถานะไม่สำเร็จ" } }, { status: 502 });
  }
  if (!data) {
    return NextResponse.json({ error: { code: "ORDER_NOT_FOUND", message: "ไม่พบคำสั่งซื้อนี้" } }, { status: 404 });
  }

  return NextResponse.json({ orderNumber: data.order_number, productionExportedAt: data.production_exported_at });
}
