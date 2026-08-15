import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Track Order",
};

/**
 * Placeholder. Full order tracking UI (secure lookup + status timeline) is
 * out of Phase 2 scope — this exists only so the header's "Track Order"
 * link isn't dead. Customers placing an order today land on
 * /orders/[token] directly, which already carries full status + a secure,
 * unguessable token in the URL (§22/§28).
 */
export default function TrackOrderPage() {
  return (
    <section className="mx-auto max-w-xl px-4 py-24 text-center sm:px-6">
      <h1 className="font-display text-3xl uppercase tracking-wide">Track Your Order</h1>
      <p className="mt-4 text-sm text-foreground/70">
        Use the confirmation link from your order email or SMS to check its status.
        A lookup form is coming soon.
      </p>
    </section>
  );
}
