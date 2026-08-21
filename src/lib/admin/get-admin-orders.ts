import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface AdminOrderSummary {
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  customerEmail: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalQuantity: number;
  unitPriceSatang: number | null;
  subtotalSatang: number;
  shippingFeeSatang: number;
  totalSatang: number;
  createdAt: string;
}

/**
 * Recent orders for /admin/orders — RLS-scoped (not service-role): the
 * `orders_admin_only`/`order_items_admin_only`/`customers_admin_only`
 * policies (0002_rls.sql) already grant a logged-in `is_admin()` session
 * exactly this data, so Postgres itself is the real enforcement even if
 * the app-level requireAdminUser() check were ever bypassed.
 */
// §11 admin search covers whatever's fetched here — this shop's order
// volume is small (dozens–low hundreds), so one generous, cheap query
// plus client-side search/pagination (src/lib/admin/filter-admin-orders.ts)
// is simpler and just as correct as a server-side search endpoint.
export async function getRecentOrdersForAdmin(limit = 500): Promise<AdminOrderSummary[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      order_number, payment_status, fulfillment_status,
      subtotal_satang, shipping_fee_satang, total_satang, created_at,
      customers ( full_name, phone, email ),
      order_items ( quantity, unit_price_satang )
    `,
    )
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error || !data) return [];

  return (data as unknown as Array<{
    order_number: string;
    payment_status: string;
    fulfillment_status: string;
    subtotal_satang: number;
    shipping_fee_satang: number;
    total_satang: number;
    created_at: string;
    customers: { full_name: string; phone: string; email: string | null } | null;
    order_items: Array<{ quantity: number; unit_price_satang: number }>;
  }>).map((row) => ({
    orderNumber: row.order_number,
    customerName: row.customers?.full_name ?? null,
    customerPhone: row.customers?.phone ?? null,
    customerEmail: row.customers?.email ?? null,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    totalQuantity: row.order_items.reduce((sum, i) => sum + i.quantity, 0),
    // Every line in one order shares the same tier-driven unit price by
    // construction (§19) — the first item's price is that shared value.
    unitPriceSatang: row.order_items[0]?.unit_price_satang ?? null,
    subtotalSatang: row.subtotal_satang,
    shippingFeeSatang: row.shipping_fee_satang,
    totalSatang: row.total_satang,
    createdAt: row.created_at,
  }));
}
