import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrderByTrackingToken } from "@/lib/orders/get-order-by-token";
import { formatSatangAsThb } from "@/lib/money";

export const metadata: Metadata = {
  title: "Payment Instructions",
  robots: { index: false, follow: false },
};

/**
 * Placeholder only. Bank/PromptPay display, slip upload, and OCR
 * verification are Phase 4 (§21/§22 confirmation flow + §30 scope) — this
 * page exists so the confirmation page's "Continue to Payment" CTA has
 * somewhere real to land, tied to the same tracking-token ownership model.
 */
export default async function OrderPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await getOrderByTrackingToken(token);

  if (!order) notFound();

  return (
    <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
        {order.orderNumber}
      </p>
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide">Payment Instructions</h1>
      <p className="mt-4 text-sm text-foreground/70">
        Amount due: <span className="font-medium tabular-nums">{formatSatangAsThb(order.totalSatang)}</span>
      </p>
      <p className="mt-6 border border-line p-5 text-sm text-foreground/60">
        Bank transfer / PromptPay details and slip upload are coming soon. Your order is
        reserved — check back here shortly.
      </p>
    </section>
  );
}
