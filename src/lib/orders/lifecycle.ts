/**
 * Centralized order/payment lifecycle logic — the single place that
 * knows what the raw enum values from the database mean for a customer.
 * Nothing outside this module should render a raw `payment_status` /
 * `fulfillment_status` string, or independently recompute whether a
 * reservation has expired.
 *
 * Enum values mirror supabase/migrations/0001_init.sql exactly.
 */

export type PaymentStatus =
  | "awaiting_payment"
  | "slip_uploaded"
  | "verifying"
  | "verified"
  | "needs_review"
  | "rejected"
  | "duplicate_slip"
  | "expired";

export type FulfillmentStatus =
  | "pending_payment"
  | "paid"
  | "processing"
  | "packed"
  | "shipped"
  | "delivered"
  | "cancelled";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  awaiting_payment: "Awaiting payment",
  slip_uploaded: "Slip received — verifying",
  verifying: "Verifying payment",
  verified: "Payment verified",
  needs_review: "Payment under review",
  rejected: "Payment rejected",
  duplicate_slip: "Payment flagged — contact support",
  expired: "Payment window expired",
};

export const FULFILLMENT_STATUS_LABELS: Record<FulfillmentStatus, string> = {
  pending_payment: "Pending payment",
  paid: "Paid",
  processing: "Processing",
  packed: "Packed",
  shipped: "Shipped",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

/** Never renders a raw enum value — unrecognized input falls back to a safe label. */
export function getPaymentStatusLabel(status: string): string {
  return PAYMENT_STATUS_LABELS[status as PaymentStatus] ?? "Unknown status";
}

export function getFulfillmentStatusLabel(status: string): string {
  return FULFILLMENT_STATUS_LABELS[status as FulfillmentStatus] ?? "Unknown status";
}

/**
 * True only when an order is still nominally "awaiting payment" in the
 * database AND its reservation deadline has actually passed. This is the
 * client-visible signal; the authoritative state change happens via
 * expire_stale_reservations() (0007_reservation_expiration.sql) run by
 * the cron endpoint — this function never mutates anything, it only
 * *describes* what should already be true or will become true shortly.
 */
export function isReservationExpired(
  order: { paymentStatus: string; reservationExpiresAt: string | null },
  now: number = Date.now(),
): boolean {
  if (order.paymentStatus !== "awaiting_payment") return false;
  if (!order.reservationExpiresAt) return false;
  const expiresAt = new Date(order.reservationExpiresAt).getTime();
  if (Number.isNaN(expiresAt)) return false;
  return expiresAt <= now;
}

/**
 * Whether an order can still be paid right now. Distinct from
 * `paymentStatus === 'awaiting_payment'` because a reservation can be
 * logically expired in the browser's eyes moments before the server-side
 * sweep has actually flipped payment_status to 'expired' — this treats
 * that window as already unpayable, matching what the customer should
 * see (§6: never let it "appear payable as if its stock were guaranteed").
 */
export function isOrderPayable(
  order: { paymentStatus: string; reservationExpiresAt: string | null },
  now: number = Date.now(),
): boolean {
  if (order.paymentStatus !== "awaiting_payment") return false;
  return !isReservationExpired(order, now);
}

export type CountdownState =
  | { status: "no-deadline" }
  | { status: "invalid" }
  | { status: "expired" }
  | { status: "counting"; remainingMs: number };

/**
 * Pure function driving the payment countdown. The `now` parameter
 * defaults to the real clock but is always passed explicitly by callers
 * that tick a timer, so this stays trivially testable — including the
 * malformed-timestamp case, which must never throw.
 */
export function getCountdownState(expiresAt: string | null, now: number = Date.now()): CountdownState {
  if (!expiresAt) return { status: "no-deadline" };
  const target = new Date(expiresAt).getTime();
  if (Number.isNaN(target)) return { status: "invalid" };
  const remainingMs = target - now;
  if (remainingMs <= 0) return { status: "expired" };
  return { status: "counting", remainingMs };
}

/** Formats a positive duration as MM:SS (or H:MM:SS past an hour). */
export function formatCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const mm = minutes.toString().padStart(2, "0");
  const ss = seconds.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}
