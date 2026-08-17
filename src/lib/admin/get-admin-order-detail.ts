import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ProductionSourceItem } from "./flatten-production-list";

export interface AdminOrderDetail {
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalQuantity: number;
  unitPriceSatang: number | null;
  subtotalSatang: number;
  shippingFeeSatang: number;
  totalSatang: number;
  createdAt: string;
  shippingMethodName: string | null;
  shippingAddress: {
    addressLine: string;
    subdistrict: string;
    district: string;
    province: string;
    postalCode: string;
  } | null;
  productionItems: ProductionSourceItem[];
}

/** Single order, full detail, for /admin/orders/[orderNumber] (§ admin production visibility). */
export async function getAdminOrderDetail(orderNumber: string): Promise<AdminOrderDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      order_number, payment_status, fulfillment_status,
      subtotal_satang, shipping_fee_satang, total_satang, created_at,
      shipping_methods ( name ),
      addresses ( address_line, subdistrict, district, province, postal_code ),
      customers ( full_name, phone ),
      order_items ( color_name_snapshot, size_name_snapshot, quantity, unit_price_satang, customizations )
    `,
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    order_number: string;
    payment_status: string;
    fulfillment_status: string;
    subtotal_satang: number;
    shipping_fee_satang: number;
    total_satang: number;
    created_at: string;
    shipping_methods: { name: string } | null;
    addresses: {
      address_line: string;
      subdistrict: string;
      district: string;
      province: string;
      postal_code: string;
    } | null;
    customers: { full_name: string; phone: string } | null;
    order_items: Array<{
      color_name_snapshot: string;
      size_name_snapshot: string;
      quantity: number;
      unit_price_satang: number;
      customizations: Array<{ name: string | null; number: string | null }> | null;
    }>;
  };

  return {
    orderNumber: row.order_number,
    customerName: row.customers?.full_name ?? null,
    customerPhone: row.customers?.phone ?? null,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    totalQuantity: row.order_items.reduce((sum, i) => sum + i.quantity, 0),
    unitPriceSatang: row.order_items[0]?.unit_price_satang ?? null,
    subtotalSatang: row.subtotal_satang,
    shippingFeeSatang: row.shipping_fee_satang,
    totalSatang: row.total_satang,
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
    productionItems: row.order_items.map((i) => ({
      colorNameSnapshot: i.color_name_snapshot,
      sizeNameSnapshot: i.size_name_snapshot,
      customizations: i.customizations,
    })),
  };
}
