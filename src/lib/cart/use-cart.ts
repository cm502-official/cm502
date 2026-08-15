"use client";

import { useSyncExternalStore } from "react";
import { getCartSnapshot, getServerCartSnapshot, subscribeCart } from "./store";

export function useCart() {
  const cart = useSyncExternalStore(subscribeCart, getCartSnapshot, getServerCartSnapshot);

  const itemCount = cart.items.reduce((sum, line) => sum + line.quantity, 0);
  const subtotalSatang = cart.items.reduce(
    (sum, line) => sum + line.unitPriceSatang * line.quantity,
    0,
  );

  return { cart, items: cart.items, itemCount, subtotalSatang };
}
