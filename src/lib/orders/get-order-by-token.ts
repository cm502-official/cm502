import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

export interface OrderConfirmation {
  orderNumber: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  subtotalSatang: number;
  shippingFeeSatang: number;
  totalSatang: number;
  reservationExpiresAt: string | null;
  createdAt: string;
  shippingMethodName: string | null;
  shippingAddress: {
    addressLine: string;
    subdistrict: string;
    district: string;
    province: string;
    postalCode: string;
  } | null;
  customerName: string | null;
  items: Array<{
    productName: string;
    colorName: string;
    sizeName: string;
    quantity: number;
    unitPriceSatang: number;
    lineTotalSatang: number;
  }>;
}

/**
 * Looks up an order by its unguessable tracking_token — never by the
 * internal UUID or a sequential id (§22/§26). Uses the service-role client
 * because `orders` has no anon RLS policy at all; this function is the
 * sole, deliberate gate that decides what a customer may see about their
 * own order, and it returns only customer-safe fields (no internal IDs,
 * no payment/OCR internals).
 */
export async function getOrderByTrackingToken(token: string): Promise<OrderConfirmation | null> {
  // Tokens are 32 lowercase hex chars (see generate_tracking_token() in
  // 0001_init.sql) — reject anything else before it ever reaches a query.
  if (!/^[a-f0-9]{32}$/.test(token)) return null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // Supabase unreachable/unconfigured — degrades to the same
    // customer-safe "not found" page rather than crashing (§23/§29).
    return null;
  }

  const { data, error } = await admin
    .from("orders")
    .select(
      `
      order_number, payment_status, fulfillment_status,
      subtotal_satang, shipping_fee_satang, total_satang,
      reservation_expires_at, created_at,
      shipping_methods ( name ),
      addresses ( address_line, subdistrict, district, province, postal_code ),
      customers ( full_name ),
      order_items ( product_name_snapshot, color_name_snapshot, size_name_snapshot, quantity, unit_price_satang, line_total_satang )
    `,
    )
    .eq("tracking_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    order_number: string;
    payment_status: string;
    fulfillment_status: string;
    subtotal_satang: number;
    shipping_fee_satang: number;
    total_satang: number;
    reservation_expires_at: string | null;
    created_at: string;
    shipping_methods: { name: string } | null;
    addresses: {
      address_line: string;
      subdistrict: string;
      district: string;
      province: string;
      postal_code: string;
    } | null;
    customers: { full_name: string } | null;
    order_items: Array<{
      product_name_snapshot: string;
      color_name_snapshot: string;
      size_name_snapshot: string;
      quantity: number;
      unit_price_satang: number;
      line_total_satang: number;
    }>;
  };

  return {
    orderNumber: row.order_number,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    subtotalSatang: row.subtotal_satang,
    shippingFeeSatang: row.shipping_fee_satang,
    totalSatang: row.total_satang,
    reservationExpiresAt: row.reservation_expires_at,
    createdAt: row.created_at,
    shippingMethodName: row.shipping_methods?.name ?? null,
    shippingAddress: row.addresses
      ? {
          addressLine: row.addresses.address_line,
          subdistrict: row.addresses.subdistrict,
          district: row.addresses.district,
          province: row.addresses.province,
          postalCode: row.addresses.postal_code,
        }
      : null,
    customerName: row.customers?.full_name ?? null,
    items: row.order_items.map((item) => ({
      productName: item.product_name_snapshot,
      colorName: item.color_name_snapshot,
      sizeName: item.size_name_snapshot,
      quantity: item.quantity,
      unitPriceSatang: item.unit_price_satang,
      lineTotalSatang: item.line_total_satang,
    })),
  };
}
