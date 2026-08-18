import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { phoneSchema } from "@/lib/validation/checkout";
import type { OrderConfirmation, OrderItemCustomization } from "./get-order-by-token";

/**
 * Order-number + phone lookup for /track-order.
 *
 * Security model: order numbers are sequential and guessable by design
 * (CM502-20260815-0001, ...0002, ...) — they are NOT a secret like the
 * tracking token. Ownership is proven by also matching the phone number
 * on file. A wrong phone and an unknown order number must be
 * indistinguishable to the caller (§9): both return null here, and the
 * route handler maps null to one identical generic error, never
 * revealing which half was wrong or whether the order number exists at
 * all.
 */
export async function getOrderByOrderNumberAndPhone(
  orderNumber: string,
  phone: string,
): Promise<(OrderConfirmation & { trackingToken: string }) | null> {
  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }

  const { data: order, error: orderError } = await admin
    .from("orders")
    .select(
      `
      tracking_token, order_number, payment_status, fulfillment_status,
      subtotal_satang, shipping_fee_satang, total_satang,
      reservation_expires_at, created_at, customer_id,
      shipping_methods ( name ),
      addresses ( address_line, soi_road, subdistrict, district, province, postal_code, delivery_note ),
      customers ( full_name, phone ),
      order_items ( product_name_snapshot, color_name_snapshot, size_name_snapshot, quantity, unit_price_satang, line_total_satang, customizations )
    `,
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (orderError || !order) return null;

  const row = order as unknown as {
    tracking_token: string;
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
      soi_road: string | null;
      subdistrict: string;
      district: string;
      province: string;
      postal_code: string;
      delivery_note: string | null;
    } | null;
    customers: { full_name: string; phone: string } | null;
    order_items: Array<{
      product_name_snapshot: string;
      color_name_snapshot: string;
      size_name_snapshot: string;
      quantity: number;
      unit_price_satang: number;
      line_total_satang: number;
      customizations: OrderItemCustomization[] | null;
    }>;
  };

  if (!row.customers) return null;

  // Both sides normalized identically (same transform phoneSchema
  // applies at checkout, so a stored phone and a freshly-submitted one
  // compare correctly regardless of hyphen/space formatting).
  const storedPhone = row.customers.phone;
  const submittedPhone = phoneSchema.safeParse(phone);
  if (!submittedPhone.success || submittedPhone.data !== storedPhone) {
    return null;
  }

  return {
    trackingToken: row.tracking_token,
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
          soiRoad: row.addresses.soi_road,
          subdistrict: row.addresses.subdistrict,
          district: row.addresses.district,
          province: row.addresses.province,
          postalCode: row.addresses.postal_code,
          deliveryNote: row.addresses.delivery_note,
        }
      : null,
    customerName: row.customers.full_name,
    items: row.order_items.map((item) => ({
      productName: item.product_name_snapshot,
      colorName: item.color_name_snapshot,
      sizeName: item.size_name_snapshot,
      quantity: item.quantity,
      unitPriceSatang: item.unit_price_satang,
      lineTotalSatang: item.line_total_satang,
      customizations: item.customizations,
    })),
  };
}
