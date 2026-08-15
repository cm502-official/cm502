/**
 * "Buy Now" is a single-item express checkout that must NOT disturb
 * whatever's already in the persistent cart. It lives in sessionStorage
 * (tab-scoped, cleared when the tab closes) as its own small slot, kept
 * separate from lib/cart/store.ts on purpose.
 *
 * Checkout reads this first; if present, checkout is scoped to just this
 * one item and the slot is cleared after a successful order. The regular
 * cart is left untouched either way.
 */
import { z } from "zod";
import { cartItemSchema, type CartItem } from "./schema";

const BUY_NOW_STORAGE_KEY = "cm502.buyNow.v1";

const buyNowSchema = z.object({
  version: z.literal(1),
  item: cartItemSchema,
});

export function setBuyNowItem(item: CartItem): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(BUY_NOW_STORAGE_KEY, JSON.stringify({ version: 1, item }));
  } catch {
    // sessionStorage unavailable — Buy Now silently falls back to
    // behaving like Add to Cart + navigate, since getBuyNowItem() will
    // then simply return null on the checkout page.
  }
}

export function getBuyNowItem(): CartItem | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(BUY_NOW_STORAGE_KEY);
    if (!raw) return null;
    const parsed = buyNowSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data.item : null;
  } catch {
    return null;
  }
}

export function clearBuyNowItem(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(BUY_NOW_STORAGE_KEY);
  } catch {
    // ignore
  }
}
