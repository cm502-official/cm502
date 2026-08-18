import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Server-only lookup carrying the internal order id — never returned to
 * the browser. Ownership is established by the unguessable tracking
 * token alone, same model as every other customer-facing order lookup
 * (resolve-order-for-payment.ts is the payment-slip analogue).
 */
export interface OrderForProofUpload {
  id: string;
  orderNumber: string;
  shippingChoice: string;
  existingProofTypes: string[];
}

export async function resolveOrderForProofUpload(token: string): Promise<OrderForProofUpload | null> {
  if (!/^[a-f0-9]{32}$/.test(token)) return null;

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return null;
  }

  const { data, error } = await admin
    .from("orders")
    .select("id, order_number, shipping_choice, order_shipping_proofs(proof_type)")
    .eq("tracking_token", token)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    id: string;
    order_number: string;
    shipping_choice: string;
    order_shipping_proofs: Array<{ proof_type: string }> | null;
  };

  return {
    id: row.id,
    orderNumber: row.order_number,
    shippingChoice: row.shipping_choice,
    existingProofTypes: (row.order_shipping_proofs ?? []).map((p) => p.proof_type),
  };
}
