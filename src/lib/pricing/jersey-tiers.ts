/**
 * CM502 Jersey quantity-tier pricing — the single source of truth for
 * "price per shirt" as a function of total order quantity.
 *
 * The tier is determined by the TOTAL number of shirts in the order,
 * summed across every size/color line — not per line item. A mixed order
 * of S×2 + M×2 + L×1 = 5 shirts prices every shirt at the 5-unit tier.
 *
 * This mirrors get_tier_unit_price_satang() in
 * supabase/migrations/0014_jersey_preorder_tier_pricing.sql exactly —
 * keep the two in sync if tiers ever change. The database function is
 * the actual authority at order-creation time (§ server-authoritative
 * pricing); this module exists so the UI can show the same numbers
 * without a round trip, and so both sides are tested against the same
 * boundary values.
 */

export interface JerseyPriceTier {
  /** Inclusive minimum quantity this tier applies from. */
  minQuantity: number;
  /** Inclusive maximum quantity this tier applies to, or null for "and up". */
  maxQuantity: number | null;
  unitPriceSatang: number;
}

// Ordered highest-minimum-first so getJerseyUnitPriceSatang can do a
// simple first-match scan.
export const JERSEY_PRICE_TIERS: readonly JerseyPriceTier[] = [
  { minQuantity: 50, maxQuantity: null, unitPriceSatang: 28900 },
  { minQuantity: 20, maxQuantity: 49, unitPriceSatang: 29900 },
  { minQuantity: 10, maxQuantity: 19, unitPriceSatang: 34900 },
  { minQuantity: 5, maxQuantity: 9, unitPriceSatang: 37900 },
  { minQuantity: 3, maxQuantity: 4, unitPriceSatang: 39900 },
  { minQuantity: 1, maxQuantity: 2, unitPriceSatang: 41900 },
];

/**
 * Price per shirt (in satang) for a given total order quantity.
 * Quantities below 1 fall back to the lowest tier's price — callers are
 * responsible for rejecting non-positive quantities before checkout;
 * this function never throws so it stays safe to call from render paths
 * with in-progress (possibly zero) UI state.
 */
export function getJerseyUnitPriceSatang(totalQuantity: number): number {
  const qty = Number.isFinite(totalQuantity) ? Math.max(0, Math.trunc(totalQuantity)) : 0;
  for (const tier of JERSEY_PRICE_TIERS) {
    if (qty >= tier.minQuantity) return tier.unitPriceSatang;
  }
  // qty === 0: no shirts yet, but still show the entry-tier price as the
  // "starting from" figure rather than 0.
  return JERSEY_PRICE_TIERS[JERSEY_PRICE_TIERS.length - 1].unitPriceSatang;
}

/** Product subtotal (in satang) for a given total order quantity. */
export function calculateJerseySubtotalSatang(totalQuantity: number): number {
  const qty = Number.isFinite(totalQuantity) ? Math.max(0, Math.trunc(totalQuantity)) : 0;
  return getJerseyUnitPriceSatang(qty) * qty;
}

/** Which tier (by minQuantity) is currently active, for UI highlighting. */
export function getActiveTierMinQuantity(totalQuantity: number): number {
  const qty = Number.isFinite(totalQuantity) ? Math.max(0, Math.trunc(totalQuantity)) : 0;
  for (const tier of JERSEY_PRICE_TIERS) {
    if (qty >= tier.minQuantity) return tier.minQuantity;
  }
  return JERSEY_PRICE_TIERS[JERSEY_PRICE_TIERS.length - 1].minQuantity;
}

/**
 * The cheapest and most expensive per-shirt price across every tier —
 * for the product-page headline price range (e.g. "฿289–฿419"). Derived
 * from JERSEY_PRICE_TIERS rather than hardcoded, so the range can never
 * drift from the actual tier table.
 */
export function getJerseyPriceRangeSatang(): { minSatang: number; maxSatang: number } {
  const prices = JERSEY_PRICE_TIERS.map((t) => t.unitPriceSatang);
  return { minSatang: Math.min(...prices), maxSatang: Math.max(...prices) };
}
