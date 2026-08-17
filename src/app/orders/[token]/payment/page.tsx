import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByTrackingToken } from "@/lib/orders/get-order-by-token";
import { formatSatangAsThb } from "@/lib/money";
import { canUploadPaymentSlip, isPaymentVerified } from "@/lib/orders/lifecycle";
import { OrderCountdown } from "@/components/orders/order-countdown";
import { getPaymentSettings } from "@/lib/payments/get-payment-settings";
import { PaymentInstructions } from "@/components/payments/payment-instructions";
import { SlipUploadForm } from "@/components/payments/slip-upload-form";

export const metadata: Metadata = {
  title: "Payment Instructions",
  robots: { index: false, follow: false },
};

/**
 * Order → payment instructions → upload slip. Every branch below is
 * driven by the centralized lifecycle helpers (canUploadPaymentSlip,
 * isPaymentVerified) — never a raw status check scattered inline, per
 * §23. The slip-upload route handler (payment-slip/route.ts) re-derives
 * the exact same eligibility server-side; this page's branching is a UX
 * convenience, not the security boundary.
 */
export default async function OrderPaymentPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await getOrderByTrackingToken(token);

  if (!order) notFound();

  if (isPaymentVerified(order)) {
    return (
      <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">{order.orderNumber}</p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-wide">Payment Confirmed</h1>
        <p className="mt-4 text-sm text-foreground/70">
          Thank you — your payment of{" "}
          <span className="font-medium tabular-nums">{formatSatangAsThb(order.totalSatang)}</span> has been
          verified.
        </p>
        <Link
          href={`/orders/${token}`}
          className="mt-6 inline-flex h-12 items-center justify-center bg-ink px-8 text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
        >
          View Order
        </Link>
      </section>
    );
  }

  if (!canUploadPaymentSlip(order)) {
    return (
      <section className="mx-auto max-w-xl px-4 py-16 text-center sm:px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">{order.orderNumber}</p>
        <h1 className="mt-2 font-display text-3xl uppercase tracking-wide">Payment Window Expired</h1>
        <p className="mt-4 text-sm text-foreground/70">
          This order&apos;s reservation is no longer held, and payment can no longer be submitted for it.
          Please place a new order.
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

  const settings = await getPaymentSettings();
  const paymentInfoAvailable = Boolean(settings.bankTransfer || settings.promptPay);

  return (
    <section className="mx-auto max-w-xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">{order.orderNumber}</p>
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide">Payment Instructions</h1>

      <div className="mt-3">
        <OrderCountdown expiresAt={order.reservationExpiresAt} />
      </div>

      <ReviewStatusBanner paymentStatus={order.paymentStatus} />

      {!paymentInfoAvailable ? (
        <p className="mt-6 border border-line p-5 text-center text-sm text-foreground/60">
          Payment instructions aren&apos;t available right now. Please check back shortly or contact
          support.
        </p>
      ) : (
        <div className="mt-6 flex flex-col gap-6">
          <PaymentInstructions settings={settings} totalSatang={order.totalSatang} />
          <SlipUploadForm trackingToken={token} />
        </div>
      )}
    </section>
  );
}

function ReviewStatusBanner({ paymentStatus }: { paymentStatus: string }) {
  if (paymentStatus === "needs_review") {
    return (
      <p className="mt-4 border border-line p-3 text-center text-sm text-foreground/70">
        Your previous slip is under review. You can upload a new one below if needed.
      </p>
    );
  }
  if (paymentStatus === "rejected") {
    return (
      <p className="mt-4 border border-accent/40 bg-accent/5 p-3 text-center text-sm text-accent">
        Your previous slip couldn&apos;t be verified. Please check the details and upload again.
      </p>
    );
  }
  if (paymentStatus === "duplicate_slip") {
    return (
      <p className="mt-4 border border-accent/40 bg-accent/5 p-3 text-center text-sm text-accent">
        Your previous slip matched one already used for another payment. Please upload the correct
        image for this order.
      </p>
    );
  }
  return null;
}
