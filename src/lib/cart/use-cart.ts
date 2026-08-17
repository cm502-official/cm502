"use client";

import { useSyncExternalStore } from "react";
import { getCartSnapshot, getServerCartSnapshot, subscribeCart } from "./store";
import { calculateJerseySubtotalSatang, getJerseyUnitPriceSatang } from "@/lib/pricing/jersey-tiers";

export function useCart() {
  const cart = useSyncExternalStore(subscribeCart, getCartSnapshot, getServerCartSnapshot);

  const itemCount = cart.items.reduce((sum, line) => sum + line.quantity, 0);

  // Quantity-tier pricing (§ jersey-tiers): the cart is single-product
  // today, so itemCount doubles as the "total shirts in this order"
  // figure the tier table is keyed on. store.ts already keeps each
  // line's stored unitPriceSatang in sync with this same calculation
  // after every mutation, but deriving it again here means the UI never
  // depends on that being true — it's always freshly computed from the
  // one source of truth.
  const unitPriceSatang = getJerseyUnitPriceSatang(itemCount);
  const subtotalSatang = calculateJerseySubtotalSatang(itemCount);

  return { cart, items: cart.items, itemCount, unitPriceSatang, subtotalSatang };
}
