/**
 * Shipping-choice → fee mapping (§K). This is the ONLY place the fee for
 * either mode is defined — both the client's live total preview and the
 * server (inside the create_order_with_reservation RPC, mirrored in SQL)
 * derive from these two constants, never from a client-supplied number.
 *
 * §L: this supersedes shipping_methods.price_satang as the source of
 * truth for the actual charged fee. shipping_methods still exists and a
 * method is still selected/stored per order (for its name/description),
 * but the fee charged is now controlled entirely by shipping_choice —
 * see supabase/migrations/0018_shipping_choice_and_proofs.sql.
 */
export const SHIPPING_CHOICES = ["free_social_proof", "paid_shipping"] as const;
export type ShippingChoice = (typeof SHIPPING_CHOICES)[number];

export const FREE_SOCIAL_PROOF_SHIPPING_SATANG = 0;
export const PAID_SHIPPING_SATANG = 6000; // ฿60.00

export function getShippingFeeSatang(choice: ShippingChoice): number {
  return choice === "free_social_proof" ? FREE_SOCIAL_PROOF_SHIPPING_SATANG : PAID_SHIPPING_SATANG;
}

export function isShippingChoice(value: string): value is ShippingChoice {
  return (SHIPPING_CHOICES as readonly string[]).includes(value);
}
