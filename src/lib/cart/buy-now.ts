/**
 * "Buy Now" is a single-checkout express lane that must NOT disturb
 * whatever's already in the persistent cart. It lives in sessionStorage
 * (tab-scoped, cleared when the tab closes) as its own small slot, kept
 * separate from lib/cart/store.ts on purpose.
 *
 * Holds an array of items (not a single item) because a preorder
 * purchase can span multiple sizes in one go (e.g. S×2 + M×3) — all
 * priced together as one quantity-tier order (§ jersey-tiers) even
 * though they're separate variant lines.
 *
 * Checkout reads this first; if present, checkout is scoped to just
 * these items and the slot is cleared after a successful order. The
 * regular cart is left untouched either way.
 */
import { z } from "zod";
import { cartItemSchema, type CartItem } from "./schema";

const BUY_NOW_STORAGE_KEY = "cm502.buyNow.v2";

const buyNowSchema = z.object({
  version: z.literal(2),
  items: z.array(cartItemSchema).min(1),
});

export function setBuyNowItems(items: CartItem[]): void {
  if (typeof window === "undefined" || items.length === 0) return;
  try {
    window.sessionStorage.setItem(BUY_NOW_STORAGE_KEY, JSON.stringify({ version: 2, items }));
  } catch {
    // sessionStorage unavailable — Buy Now silently falls back to
    // behaving like Add to Cart + navigate, since getBuyNowItems() will
    // then simply return null on the checkout page.
  }
}

export function getBuyNowItems(): CartItem[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BUY_NOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = buyNowSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.items : null;
  } catch {
    return null;
  }
}

export function clearBuyNowItems(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(BUY_NOW_STORAGE_KEY);
  } catch {
    // ignore
  }
}
