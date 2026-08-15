import { z } from "zod";

/**
 * Cart schema — versioned so a future shape change can migrate old
 * localStorage data instead of just discarding carts. Bump
 * CART_SCHEMA_VERSION and add a migration branch in `readFromStorage`
 * (store.ts) when the shape changes.
 */
export const CART_STORAGE_KEY = "cm502.cart.v1";
export const CART_SCHEMA_VERSION = 1;

export const cartItemSchema = z.object({
  variantId: z.string().uuid(),
  productId: z.string().uuid(),
  productSlug: z.string().min(1),
  productName: z.string().min(1),
  colorName: z.string().min(1),
  sizeName: z.string().min(1),
  sku: z.string().min(1),
  /** Display only — the server recomputes the authoritative price at checkout. */
  unitPriceSatang: z.number().int().nonnegative(),
  imageUrl: z.string().nullable(),
  quantity: z.number().int().positive(),
});

export const cartStateSchema = z.object({
  version: z.literal(CART_SCHEMA_VERSION),
  items: z.array(cartItemSchema),
});

export type CartItem = z.infer<typeof cartItemSchema>;
export type CartState = z.infer<typeof cartStateSchema>;

export function emptyCart(): CartState {
  return { version: CART_SCHEMA_VERSION, items: [] };
}
