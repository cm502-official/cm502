/**
 * Cart abstraction — the single place that touches localStorage. Nothing
 * else in the app should call `window.localStorage` directly for cart
 * data; import the functions below instead.
 *
 * Design:
 *   - In-memory `state` is the source of truth for the current tab;
 *     localStorage is persistence, not the read path, so reads are
 *     synchronous and cheap (needed for useSyncExternalStore).
 *   - Every mutation recovers safely: malformed JSON, a schema mismatch,
 *     or a full/blocked storage quota all fall back to an empty cart or a
 *     no-op write rather than throwing into the caller.
 *   - Cross-tab sync via the `storage` event.
 */
import {
  CART_STORAGE_KEY,
  type CartItem,
  type CartState,
  type ShirtCustomization,
  cartStateSchema,
  emptyCart,
} from "./schema";
import { getJerseyUnitPriceSatang } from "@/lib/pricing/jersey-tiers";

// The jersey is sold as unlimited preorder (§ create_order_with_reservation
// preorder bypass) — quantity is no longer capped by stock. This remains a
// sane anti-abuse ceiling only, matching validation/checkout.ts.
const MAX_QUANTITY_PER_LINE = 100000;

/**
 * Quantity-tier pricing (§ jersey-tiers): every line in this cart is the
 * same preorder product today (there's only one product in the whole
 * storefront), so the applicable tier is driven by the TOTAL quantity
 * across every line, combined — never a per-line price. Re-run after
 * every mutation so no line ever carries a stale price: e.g. dropping
 * from 10 shirts to 9 must immediately re-price every remaining shirt
 * at the 9-unit tier, not leave the old 10-unit price cached.
 *
 * If a second product is ever added to the catalog, this needs to group
 * by productId instead of treating the whole cart as one tier group.
 */
function repriceForCombinedQuantity(items: CartItem[]): CartItem[] {
  const totalQuantity = items.reduce((sum, line) => sum + line.quantity, 0);
  const unitPriceSatang = getJerseyUnitPriceSatang(totalQuantity);
  return items.map((line) => ({ ...line, unitPriceSatang }));
}

function readFromStorage(): CartState {
  if (typeof window === "undefined") return emptyCart();
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return emptyCart();
    const parsed = cartStateSchema.safeParse(JSON.parse(raw));
    // Malformed JSON, wrong shape, or an old/unknown schema version — all
    // recovered the same way: start clean rather than crash the page.
    // This includes v1 carts (no `customizations` field) — cart contents
    // aren't historical data worth a real migration path for.
    if (!parsed.success) return emptyCart();
    return parsed.data;
  } catch {
    return emptyCart();
  }
}

function persist(next: CartState): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Storage full, disabled (private browsing), or unavailable — cart
    // still works for the rest of this session via in-memory state.
  }
}

let state: CartState = readFromStorage();

const listeners = new Set<() => void>();

function emitChange(): void {
  for (const listener of listeners) listener();
}

function setState(next: CartState): void {
  state = next;
  persist(next);
  emitChange();
}

export function subscribeCart(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getCartSnapshot(): CartState {
  return state;
}

/** Stable empty-cart snapshot for the server render pass of useSyncExternalStore. */
const SERVER_SNAPSHOT = emptyCart();
export function getServerCartSnapshot(): CartState {
  return SERVER_SNAPSHOT;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key !== CART_STORAGE_KEY) return;
    state = readFromStorage();
    emitChange();
  });
}

function clampCustomizations(customizations: ShirtCustomization[]): ShirtCustomization[] {
  return customizations.slice(0, MAX_QUANTITY_PER_LINE);
}

/**
 * Adds customized shirts to the cart. `customizations` holds one entry
 * per physical shirt (§ per-shirt personalization) — quantity is always
 * derived as `customizations.length`, never a raw number a caller could
 * pass out of sync.
 *
 * Two shirts of the exact same variant (color+size) are still merged
 * into one cart LINE (so the cart display groups "Black / M · 3 ตัว"
 * rather than three separate line items) — but their customizations are
 * concatenated, never overwritten or collapsed. Adding Black/M "SMITH #10"
 * and later Black/M "JONES #7" results in one Black/M line with BOTH
 * customizations preserved.
 */
export function addToCart(
  item: Omit<CartItem, "quantity" | "customizations">,
  customizations: ShirtCustomization[],
): void {
  if (customizations.length === 0) return;
  const items = [...state.items];
  const existingIndex = items.findIndex((line) => line.variantId === item.variantId);

  if (existingIndex >= 0) {
    const merged = clampCustomizations([...items[existingIndex].customizations, ...customizations]);
    items[existingIndex] = { ...items[existingIndex], ...item, quantity: merged.length, customizations: merged };
  } else {
    const clamped = clampCustomizations(customizations);
    items.push({ ...item, quantity: clamped.length, customizations: clamped });
  }

  setState({ version: state.version, items: repriceForCombinedQuantity(items) });
}

/**
 * Replaces the full customization list for one variant line — the
 * primitive behind "แก้ไขรายละเอียดเสื้อ" (edit from cart, §18): add,
 * remove, or edit individual shirts within a line. Quantity is derived
 * from the new array's length; an empty array removes the line entirely.
 */
export function setLineCustomizations(variantId: string, customizations: ShirtCustomization[]): void {
  if (customizations.length === 0) {
    removeFromCart(variantId);
    return;
  }
  const clamped = clampCustomizations(customizations);
  const items = state.items.map((line) =>
    line.variantId === variantId ? { ...line, quantity: clamped.length, customizations: clamped } : line,
  );
  setState({ version: state.version, items: repriceForCombinedQuantity(items) });
}

export function removeFromCart(variantId: string): void {
  const items = state.items.filter((line) => line.variantId !== variantId);
  setState({ version: state.version, items: repriceForCombinedQuantity(items) });
}

export function clearCart(): void {
  setState(emptyCart());
}

/** Exposed for tests only — resets the module-level in-memory cart. */
export function __resetCartForTests(): void {
  state = emptyCart();
}

/**
 * Exposed for tests only — re-runs the same localStorage read + recovery
 * path used at module init, so tests can exercise malformed-storage
 * recovery without needing a fresh module instance per case.
 */
export function __reloadCartFromStorageForTests(): void {
  state = readFromStorage();
}
