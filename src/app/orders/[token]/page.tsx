import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrderByTrackingToken } from "@/lib/orders/get-order-by-token";
import { formatSatangAsThb } from "@/lib/money";

export const metadata: Metadata = {
  title: "Order Confirmation",
  robots: { index: false, follow: false },
};

const PAYMENT_STATUS_LABELS: Record<string, string> = {
  awaiting_payment: "Awaiting payment",
  slip_uploaded: "Slip received — verifying",
  verifying: "Verifying payment",
  verified: "Payment verified",
  needs_review: "Payment under review",
  rejected: "Payment rejected",
  duplicate_slip: "Payment flagged — contact support",
  expired: "Reservation expired",
};

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await getOrderByTrackingToken(token);

  if (!order) notFound();

  const paymentLabel = PAYMENT_STATUS_LABELS[order.paymentStatus] ?? order.paymentStatus;

  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">
        Order confirmed
      </p>
      <h1 className="mt-2 font-display text-3xl uppercase tracking-wide sm:text-4xl">
        {order.orderNumber}
      </h1>

      <div className="mt-6 border border-line p-5">
        <p className="text-sm font-medium">{paymentLabel}</p>
        {order.paymentStatus === "awaiting_payment" && order.reservationExpiresAt && (
          <p className="mt-1 text-xs text-foreground/60">
            Please complete payment before{" "}
            {new Date(order.reservationExpiresAt).toLocaleString("en-GB", {
              dateStyle: "medium",
              timeStyle: "short",
            })}
            , or your items may be released back into stock.
          </p>
        )}
      </div>

      <div className="mt-8">
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">Items</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {order.items.map((item, index) => (
            <li key={index} className="flex items-center justify-between text-sm">
              <span>
                {item.productName}
                <span className="text-foreground/60">
                  {" "}
                  — {item.colorName} / {item.sizeName} × {item.quantity}
                </span>
              </span>
              <span className="tabular-nums">{formatSatangAsThb(item.lineTotalSatang)}</span>
            </li>
          ))}
        </ul>
      </div>

      {order.shippingAddress && (
        <div className="mt-8">
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
            Shipping to
          </h2>
          <p className="mt-2 text-sm text-foreground/80">
            {order.customerName}
            <br />
            {order.shippingAddress.addressLine}, {order.shippingAddress.subdistrict},{" "}
            {order.shippingAddress.district}, {order.shippingAddress.province}{" "}
            {order.shippingAddress.postalCode}
          </p>
          {order.shippingMethodName && (
            <p className="mt-1 text-sm text-foreground/60">{order.shippingMethodName}</p>
          )}
        </div>
      )}

      <div className="mt-8 flex flex-col gap-1.5 border-t border-line pt-6 text-sm">
        <div className="flex justify-between">
          <span className="text-foreground/60">Subtotal</span>
          <span className="tabular-nums">{formatSatangAsThb(order.subtotalSatang)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground/60">Shipping</span>
          <span className="tabular-nums">{formatSatangAsThb(order.shippingFeeSatang)}</span>
        </div>
        <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-semibold">
          <span>Total</span>
          <span className="tabular-nums">{formatSatangAsThb(order.totalSatang)}</span>
        </div>
      </div>

      <Link
        href={`/orders/${token}/payment`}
        className="mt-8 flex h-14 w-full items-center justify-center bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
      >
        Continue to Payment
      </Link>
    </section>
  );
}
