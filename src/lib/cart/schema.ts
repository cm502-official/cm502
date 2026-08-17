import { z } from "zod";

/**
 * Cart schema — versioned so a future shape change can migrate old
 * localStorage data instead of just discarding carts. Bump
 * CART_SCHEMA_VERSION and add a migration branch in `readFromStorage`
 * (store.ts) when the shape changes.
 *
 * v2: added per-shirt customization (§ per-shirt personalization). A
 * CartItem is still one line per variant (color+size), but `quantity`
 * shirts of that variant can each carry their own printed name/number —
 * `customizations.length` must always equal `quantity`. v1 carts have no
 * concept of this and are simply reset to empty on load (cart contents
 * aren't historical data worth a real migration path for).
 */
export const CART_STORAGE_KEY = "cm502.cart.v1";
export const CART_SCHEMA_VERSION = 2;

/** Printed-on-jersey personalization for exactly one physical shirt. */
export const shirtCustomizationSchema = z.object({
  /** Trimmed, 1–15 chars, or null for "no name printed". Never uppercased in storage. */
  name: z.string().trim().min(1).max(15).nullable(),
  /** "0"–"99", leading zeros preserved (e.g. "07"), or null for "no number". */
  number: z
    .string()
    .regex(/^\d{1,2}$/, "Number must be 0-99")
    .nullable(),
});

export type ShirtCustomization = z.infer<typeof shirtCustomizationSchema>;

export const cartItemSchema = z
  .object({
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
    /**
     * One entry per physical shirt of this variant — length MUST equal
     * `quantity`. Two shirts of the same color/size with different
     * printed names are still two distinct customizations here, never
     * collapsed into one.
     */
    customizations: z.array(shirtCustomizationSchema),
  })
  .refine((item) => item.customizations.length === item.quantity, {
    message: "customizations.length must equal quantity",
    path: ["customizations"],
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
