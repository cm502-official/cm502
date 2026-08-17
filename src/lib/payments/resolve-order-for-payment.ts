import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-only lookup carrying the internal order id — never returned to
 * the browser. Used exclusively by the slip-upload route handler to
 * resolve a tracking token into the ids the payment RPCs need. Ownership
 * is established by the token alone (same model as every other
 * customer-facing order lookup in this codebase).
 */
export interface OrderForPayment {
  id: string;
  paymentId: string;
  orderNumber: string;
  paymentStatus: string;
  createdAt: string;
  reservationExpiresAt: string | null;
  expectedAmountSatang: number;
}

export async function resolveOrderForPayment(token: string): Promise<OrderForPayment | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }

  const { data, error } = await admin
    .from("orders")
    .select(
      "id, order_number, payment_status, created_at, reservation_expires_at, payments(id, expected_amount_satang)",
    )
    .eq("tracking_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    order_number: string;
    payment_status: string;
    created_at: string;
    reservation_expires_at: string | null;
    payments: { id: string; expected_amount_satang: number } | { id: string; expected_amount_satang: number }[] | null;
  };

  const paymentRow = Array.isArray(row.payments) ? row.payments[0] : row.payments;
  if (!paymentRow) return null;

  return {
    id: row.id,
    paymentId: paymentRow.id,
    orderNumber: row.order_number,
    paymentStatus: row.payment_status,
    createdAt: row.created_at,
    reservationExpiresAt: row.reservation_expires_at,
    expectedAmountSatang: paymentRow.expected_amount_satang,
  };
}
