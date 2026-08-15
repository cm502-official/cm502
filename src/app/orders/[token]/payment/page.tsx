import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByTrackingToken } from "@/lib/orders/get-order-by-token";
import { formatSatangAsThb } from "@/lib/money";
import { isOrderPayable } from "@/lib/orders/lifecycle";
import { OrderCountdown } from "@/components/orders/order-countdown";

export const metadata: Metadata = {
  title: "Payment Instructions",
  robots: { index: false, follow: false },
};

/**
 * Placeholder for the Phase 4 bank/PromptPay + slip upload flow. Even as
 * a placeholder, this page must never treat an expired order as normally
 * payable (§6) — that check happens here via the same centralized
 * `isOrderPayable` helper the confirmation page uses, so Phase 4's real
 * upload UI inherits the same guard by construction instead of needing
 * to remember to re-check it.
 */
export default async function OrderPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await getOrderByTrackingToken(token);

  if (!order) notFound();

  if (!isOrderPayable(order)) {
    return (
      <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
          {order.orderNumber}
        </p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-wide">Payment Window Expired</h1>
        <p className="mt-4 text-sm text-foreground/70">
          This order&apos;s reservation is no longer held, and payment can no longer be submitted
          for it. Please place a new order.
        </p>
        <Link
          href="/products/jersey"
          className="mt-6 inline-flex h-12 items-center justify-center bg-ink px-8 text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
        >
          Place a New Order
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
        {order.orderNumber}
      </p>
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide">Payment Instructions</h1>
      <p className="mt-4 text-sm text-foreground/70">
        Amount due: <span className="font-medium tabular-nums">{formatSatangAsThb(order.totalSatang)}</span>
      </p>
      <div className="mt-3">
        <OrderCountdown expiresAt={order.reservationExpiresAt} />
      </div>
      <p className="mt-6 border border-line p-5 text-sm text-foreground/60">
        Bank transfer / PromptPay details and slip upload are coming soon. Your order is
        reserved — check back here shortly.
      </p>
    </section>
  );
}
