import { NextResponse } from "next/server";
import { createOrderRequestSchema } from "@/lib/validation/checkout";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { mapDatabaseErrorCode, ORDER_ERROR_MESSAGES, type OrderErrorCode } from "@/lib/orders/errors";

/**
 * POST /api/orders
 *
 * The only source of truth for price, stock, and totals is the database,
 * read fresh inside create_order_with_reservation() (0004_commerce.sql).
 * This handler's job is: validate shape, forward to that function via the
 * service-role client, translate its result into a customer-safe response.
 * It never trusts — and never even looks at — a price/subtotal/total sent
 * by the client, because the request schema doesn't accept one.
 */
export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return errorResponse("VALIDATION_ERROR", 400);
  }

  const parsed = createOrderRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return errorResponse("VALIDATION_ERROR", 400, firstZodMessage(parsed.error));
  }
  const req = parsed.data;

  let ttlMinutes = 15;
  try {
    ttlMinutes = getServerEnv().STOCK_RESERVATION_TTL_MINUTES;
  } catch {
    // Falls back to the documented default (§20) if env parsing fails —
    // this alone should not block checkout.
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    // No Supabase project connected yet, or missing service role key.
    // Never silently pretend the order was created (§29).
    return errorResponse("SERVICE_UNAVAILABLE", 503);
  }

  const { data, error } = await admin.rpc("create_order_with_reservation", {
    p_idempotency_key: req.idempotencyKey,
    p_items: req.items.map((item) => ({
      variant_id: item.variantId,
      quantity: item.quantity,
      customizations: item.customizations,
    })),
    p_customer: {
      full_name: req.customer.fullName,
      phone: req.customer.phone,
      line_id: req.customer.lineId ?? "",
      email: req.customer.email ?? "",
    },
    p_address: {
      address_line: req.address.addressLine,
      subdistrict: req.address.subdistrict,
      district: req.address.district,
      province: req.address.province,
      postal_code: req.address.postalCode,
    },
    p_shipping_method_id: req.shippingMethodId,
    p_reservation_ttl_minutes: ttlMinutes,
  });

  if (error) {
    // Server-side diagnostics only — never forwarded to the client.
    console.error("[api/orders] create_order_with_reservation failed:", error);
    const code = mapDatabaseErrorCode(error.code);
    const status = code === "SERVICE_UNAVAILABLE" ? 503 : code === "ORDER_CREATION_FAILED" ? 502 : 409;
    return errorResponse(code, status);
  }

  if (!data) {
    console.error("[api/orders] create_order_with_reservation returned no data");
    return errorResponse("ORDER_CREATION_FAILED", 502);
  }

  const result = data as {
    order_number: string;
    tracking_token: string;
    total_satang: number;
    reservation_expires_at: string;
    idempotent_replay: boolean;
  };

  return NextResponse.json(
    {
      order: {
        orderNumber: result.order_number,
        trackingToken: result.tracking_token,
        totalSatang: result.total_satang,
        reservationExpiresAt: result.reservation_expires_at,
      },
    },
    { status: result.idempotent_replay ? 200 : 201 },
  );
}

function errorResponse(code: OrderErrorCode, status: number, message?: string) {
  return NextResponse.json(
    { error: { code, message: message ?? ORDER_ERROR_MESSAGES[code] } },
    { status },
  );
}

function firstZodMessage(error: { issues: { message: string }[] }): string | undefined {
  return error.issues[0]?.message;
}
