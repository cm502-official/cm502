import { NextResponse } from "next/server";
import { trackOrderRequestSchema } from "@/lib/validation/track-order";
import { getOrderByOrderNumberAndPhone } from "@/lib/orders/get-order-by-order-number-and-phone";

const GENERIC_ERROR = {
  error: {
    code: "NOT_FOUND",
    message: "We couldn't find an order matching those details.",
  },
} as const;

/**
 * POST /api/track-order
 *
 * Wrong phone and an unknown order number return the EXACT same response
 * (status, code, message) — no distinguishing signal for an enumeration
 * attempt to key off (§9). Validation failures also collapse to the same
 * generic message rather than pointing out which field was invalid,
 * since "invalid order number format" would itself leak information
 * about the expected format to a scripted attacker faster than
 * necessary — a customer typo gets the same gentle nudge either way.
 */
export async function POST(request: Request) {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json(GENERIC_ERROR, { status: 400 });
  }

  const parsed = trackOrderRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json(GENERIC_ERROR, { status: 400 });
  }

  const order = await getOrderByOrderNumberAndPhone(parsed.data.orderNumber, parsed.data.phone);

  if (!order) {
    return NextResponse.json(GENERIC_ERROR, { status: 404 });
  }

  // trackingToken is intentionally returned: the customer just proved
  // ownership via order number + phone, and the token lets the client
  // reuse the same OrderDetailCard / payment flow as /orders/[token].
  // Nothing else internal (order id, customer id, address id) is
  // included — same shape as getOrderByTrackingToken's return value.
  return NextResponse.json({ order });
}
