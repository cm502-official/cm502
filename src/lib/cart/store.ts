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
import { CART_STORAGE_KEY, type CartItem, type CartState, cartStateSchema, emptyCart } from "./schema";

const MAX_QUANTITY_PER_LINE = 10;

function readFromStorage(): CartState {
  if (typeof window === "undefined") return emptyCart();
  try {
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    if (!raw) return emptyCart();
    const parsed = cartStateSchema.safeParse(JSON.parse(raw));
    // Malformed JSON, wrong shape, or an old/unknown schema version — all
    // recovered the same way: start clean rather than crash the page.
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

function clampQuantity(quantity: number): number {
  return Math.max(1, Math.min(MAX_QUANTITY_PER_LINE, Math.trunc(quantity)));
}

/**
 * Adds an item to the cart, merging quantity into an existing line for the
 * same variant rather than creating a duplicate row.
 */
export function addToCart(item: Omit<CartItem, "quantity">, quantity: number): void {
  const qty = clampQuantity(quantity);
  const items = [...state.items];
  const existingIndex = items.findIndex((line) => line.variantId === item.variantId);

  if (existingIndex >= 0) {
    const merged = clampQuantity(items[existingIndex].quantity + qty);
    items[existingIndex] = { ...items[existingIndex], ...item, quantity: merged };
  } else {
    items.push({ ...item, quantity: qty });
  }

  setState({ version: state.version, items });
}

export function updateCartItemQuantity(variantId: string, quantity: number): void {
  if (quantity <= 0) {
    removeFromCart(variantId);
    return;
  }
  const qty = clampQuantity(quantity);
  setState({
    version: state.version,
    items: state.items.map((line) => (line.variantId === variantId ? { ...line, quantity: qty } : line)),
  });
}

export function removeFromCart(variantId: string): void {
  setState({
    version: state.version,
    items: state.items.filter((line) => line.variantId !== variantId),
  });
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
