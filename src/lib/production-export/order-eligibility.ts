/**
 * §13 — bulk production export must not silently include an order that
 * isn't actually ready to manufacture. "Safe by default" is narrow and
 * explicit: payment genuinely verified, and not cancelled. Everything
 * else (awaiting/needs_review/rejected/duplicate_slip/expired payment,
 * or a cancelled fulfillment) requires the admin to explicitly select it
 * AND confirm — never included just because it was in a broader list.
 */
export function isOrderSafeForProductionExport(paymentStatus: string, fulfillmentStatus: string): boolean {
  return paymentStatus === "verified" && fulfillmentStatus !== "cancelled";
}
