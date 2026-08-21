import { NextResponse } from "next/server";
import { getAdminUserOrNull } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";
import { adminOrderEditRequestSchema } from "@/lib/admin/order-edit-validation";
import { ADMIN_ORDER_EDIT_ERROR_MESSAGES, mapAdminOrderEditErrorCode, type AdminOrderEditErrorCode } from "@/lib/admin/order-edit-errors";
import { resolveThaiAddressHierarchy } from "@/lib/thai-address";

/**
 * POST /api/admin/orders/[orderNumber]/edit
 *
 * The only way an admin edit to customer/address/shirt-items is ever
 * written (§1–§6). Uses the RLS-scoped admin session client (never the
 * service-role client) so admin_update_order_details() — itself NOT
 * security definer — runs as the calling admin and Postgres RLS
 * (orders_admin_only etc., 0002_rls.sql) is the real enforcement, and
 * `auth.uid()` inside it correctly attributes the audit row to this
 * admin (§19 "reuse existing admin auth/role system").
 */
export async function POST(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const admin = await getAdminUserOrNull();
  if (!admin) {
    return errorResponse("UNAUTHORIZED", 401);
  }

  const { orderNumber } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", 400);
  }

  const parsed = adminOrderEditRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", 400, parsed.error.issues[0]?.message);
  }
  const req = parsed.data;

  // Same server-side hierarchy trust boundary as checkout (§ thai-address)
  // — never store whatever province/district/subdistrict text the
  // request happened to include, only what the ids actually resolve to.
  const resolvedAddress = resolveThaiAddressHierarchy({
    provinceId: req.address.provinceId,
    districtId: req.address.districtId,
    subdistrictId: req.address.subdistrictId,
    postalCode: req.address.postalCode,
  });
  if (!resolvedAddress) {
    return errorResponse("VALIDATION_ERROR", 400, "ที่อยู่ไม่ถูกต้อง กรุณาเลือกจังหวัด/อำเภอ/ตำบลใหม่อีกครั้ง");
  }

  const supabase = await createClient();

  const { data: orderRow, error: orderLookupError } = await supabase
    .from("orders")
    .select("id")
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (orderLookupError || !orderRow) {
    return errorResponse("ORDER_NOT_FOUND", 404);
  }

  const { data, error } = await supabase.rpc("admin_update_order_details", {
    p_order_id: orderRow.id,
    p_customer: {
      full_name: req.customer.fullName,
      phone: req.customer.phone,
      line_id: req.customer.lineId ?? "",
      email: req.customer.email ?? "",
    },
    p_address: {
      address_line: req.address.addressLine,
      soi_road: req.address.soiRoad ?? "",
      subdistrict: resolvedAddress.subdistrict,
      district: resolvedAddress.district,
      province: resolvedAddress.province,
      postal_code: resolvedAddress.postalCode,
      delivery_note: req.address.deliveryNote ?? "",
    },
    p_items: req.items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
      customizations: item.customizations,
    })),
    p_confirm_total_change: req.confirmTotalChange,
  });

  if (error) {
    console.error("[admin/orders/edit] admin_update_order_details failed:", error);
    const code = mapAdminOrderEditErrorCode(error.code);
    const status = code === "UNAUTHORIZED" ? 403 : code === "ORDER_NOT_FOUND" ? 404 : code === "CONFIRM_TOTAL_CHANGE_REQUIRED" ? 409 : 400;
    return errorResponse(code, status);
  }

  const result = data as { order_id: string; subtotal_satang: number; total_satang: number; total_changed: boolean };

  return NextResponse.json({
    orderNumber,
    subtotalSatang: result.subtotal_satang,
    totalSatang: result.total_satang,
    totalChanged: result.total_changed,
  });
}

function errorResponse(code: AdminOrderEditErrorCode, status: number, message?: string) {
  return NextResponse.json({ error: { code, message: message ?? ADMIN_ORDER_EDIT_ERROR_MESSAGES[code] } }, { status });
}
