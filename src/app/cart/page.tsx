"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart/use-cart";
import { removeFromCart, updateCartItemQuantity } from "@/lib/cart/store";
import { formatSatangAsThb } from "@/lib/money";
import { CartItemRow } from "@/components/cart/cart-item-row";

export default function CartPage() {
  const { items, subtotalSatang } = useCart();

  if (items.length === 0) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-3xl uppercase tracking-wide">Your cart is empty</h1>
        <p className="text-sm text-foreground/60">Find something you&apos;ll want to wear.</p>
        <Link
          href="/products/jersey"
          className="mt-4 inline-flex h-12 items-center justify-center bg-ink px-8 text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
        >
          Continue Shopping
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl uppercase tracking-wide sm:text-4xl">Your Cart</h1>

      <div className="mt-8">
        {items.map((item) => (
          <CartItemRow
            key={item.variantId}
            item={item}
            onQuantityChange={(quantity) => updateCartItemQuantity(item.variantId, quantity)}
            onRemove={() => removeFromCart(item.variantId)}
          />
        ))}
      </div>

      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground/60">Subtotal</span>
          <span className="font-medium tabular-nums">{formatSatangAsThb(subtotalSatang)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground/60">Shipping</span>
          <span className="text-foreground/60">Calculated at checkout</span>
        </div>
      </div>

      <Link
        href="/checkout"
        className="mt-8 flex h-14 w-full items-center justify-center bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
      >
        Checkout
      </Link>
    </section>
  );
}
