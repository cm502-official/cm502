import "server-only";

import { createClient } from "@/lib/supabase/server";
import {
  resolveReportDateRange,
  isWithinRange,
  type ReportDateRangeInput,
} from "./report-date-range";
import { buildAdminReport, type AdminReportData, type ReportOrderInput } from "./report-calculations";

/**
 * The one Supabase fetch /admin/report needs (§17 — no N+1, no
 * per-order queries). Filters to `orders.payment_status = 'verified'`
 * at the database level — the same field every other admin/production
 * surface treats as "paid" (src/lib/orders/lifecycle.ts,
 * order-eligibility.ts) — so an Awaiting/Pending/Cancelled/Rejected
 * order can never reach the report's calculations. Everything else
 * (order_items, customer name, address, payments.verified_at) rides
 * along as embedded resources in the same round trip via PostgREST
 * joins, not separate queries.
 *
 * Date-range filtering happens in JS after the fetch rather than as a
 * `.gte()`/`.lte()` on the query, because the range is defined against
 * `payments.verified_at` (a joined table's column — not reliably
 * filterable via PostgREST's embedded-resource syntax) and this shop's
 * order volume is small enough that fetching all verified orders once
 * and filtering/aggregating in one JS pass is both correct and fast —
 * the same scale assumption get-admin-orders.ts already makes.
 */
export async function getAdminReportData(rangeInput: ReportDateRangeInput): Promise<AdminReportData> {
  const range = resolveReportDateRange(rangeInput);
  const supabase = await createClient();

  const [ordersResult, colorsResult, sizesResult] = await Promise.all([
    supabase
      .from("orders")
      .select(
        `
        order_number, total_satang, production_exported_at,
        customers ( full_name ),
        addresses ( address_line, subdistrict, district, province, postal_code ),
        order_items ( color_name_snapshot, size_name_snapshot, quantity, customizations ),
        payments ( verified_at )
      `,
      )
      .eq("payment_status", "verified"),
    supabase.from("colors").select("name, sort_order"),
    supabase.from("sizes").select("name, sort_order"),
  ]);

  if (ordersResult.error) {
    throw new Error(`[admin/report] failed to load paid orders: ${ordersResult.error.message}`);
  }

  const rawOrders = (ordersResult.data ?? []) as unknown as Array<{
    order_number: string;
    total_satang: number;
    production_exported_at: string | null;
    customers: { full_name: string } | null;
    addresses: {
      address_line: string | null;
      subdistrict: string | null;
      district: string | null;
      province: string | null;
      postal_code: string | null;
    } | null;
    order_items: Array<{
      color_name_snapshot: string;
      size_name_snapshot: string;
      quantity: number;
      customizations: Array<{ name: string | null; number: string | null }> | null;
    }>;
    payments: { verified_at: string | null } | null;
  }>;

  const orders: ReportOrderInput[] = rawOrders
    // Defensive: a 'verified' order should always have a payments row with
    // verified_at set (the verification RPC sets both together), but skip
    // rather than crash the whole report if that's ever not true.
    .filter((row) => row.payments?.verified_at != null)
    .map((row) => ({
      orderNumber: row.order_number,
      customerName: row.customers?.full_name ?? null,
      verifiedAt: row.payments!.verified_at!,
      totalSatang: row.total_satang,
      productionExportedAt: row.production_exported_at,
      address: row.addresses
        ? {
            addressLine: row.addresses.address_line,
            subdistrict: row.addresses.subdistrict,
            district: row.addresses.district,
            province: row.addresses.province,
            postalCode: row.addresses.postal_code,
          }
        : null,
      items: row.order_items.map((item) => ({
        colorName: item.color_name_snapshot,
        sizeName: item.size_name_snapshot,
        quantity: item.quantity,
        customizations: item.customizations,
      })),
    }))
    .filter((order) => isWithinRange(order.verifiedAt, range));

  const colorOrder = new Map(
    ((colorsResult.data ?? []) as Array<{ name: string; sort_order: number }>).map((c) => [c.name, c.sort_order]),
  );
  const sizeOrder = new Map(
    ((sizesResult.data ?? []) as Array<{ name: string; sort_order: number }>).map((s) => [s.name, s.sort_order]),
  );

  return buildAdminReport(orders, colorOrder, sizeOrder, range);
}
