import Link from "next/link";
import type { OrderConfirmation } from "@/lib/orders/get-order-by-token";
import { formatSatangAsThb } from "@/lib/money";
import { getFulfillmentStatusLabel, getPaymentStatusLabel, isReservationExpired } from "@/lib/orders/lifecycle";
import { OrderCountdown } from "./order-countdown";

const FULFILLMENT_TIMELINE = ["pending_payment", "paid", "processing", "packed", "shipped", "delivered"] as const;

/**
 * Server-safe presentational view of an order — shared by the
 * order-confirmation page (looked up by tracking token) and the
 * track-order result (looked up by order number + phone), so the two
 * flows never duplicate this rendering logic or drift apart.
 *
 * `paymentHref` is optional: the confirmation page links to
 * /orders/[token]/payment (it has the token in the URL already);
 * track-order results also have the token in the returned order object,
 * so it can link there too once the customer has proven ownership.
 */
export function OrderDetailCard({
  order,
  paymentHref,
}: {
  order: OrderConfirmation;
  paymentHref?: string;
}) {
  // Treat as expired whether the client-side deadline has merely passed
  // (DB not yet swept by the cron job) OR the sweep has already flipped
  // payment_status to 'expired' — both must render identically, or a
  // customer refreshing right as the cron runs would see the CTA/timeline
  // flicker back on right after it disappeared.
  const expired = order.paymentStatus === "expired" || isReservationExpired(order);
  const showCountdown = order.paymentStatus === "awaiting_payment";

  return (
    <div className="flex flex-col gap-8">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-foreground/50">Order</p>
        <h1 className="mt-1 font-display text-3xl uppercase tracking-wide sm:text-4xl">{order.orderNumber}</h1>
      </div>

      <div className="border border-line p-5">
        <p className="text-sm font-medium">{getPaymentStatusLabel(expired ? "expired" : order.paymentStatus)}</p>
        <p className="mt-1 text-xs text-foreground/60">{getFulfillmentStatusLabel(order.fulfillmentStatus)}</p>

        {expired ? (
          <div className="mt-3 border-t border-line pt-3">
            <p className="text-sm text-accent">
              This order&apos;s payment window has expired and its inventory reservation is no longer
              held.
            </p>
            <Link
              href="/products/jersey"
              className="mt-3 inline-flex h-11 items-center justify-center bg-ink px-6 text-xs font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
            >
              Place a New Order
            </Link>
          </div>
        ) : (
          showCountdown && (
            <div className="mt-3 border-t border-line pt-3">
              <OrderCountdown expiresAt={order.reservationExpiresAt} />
            </div>
          )
        )}
      </div>

      {!expired && order.fulfillmentStatus !== "cancelled" && (
        <FulfillmentTimeline current={order.fulfillmentStatus} />
      )}

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">Items</h2>
        <ul className="mt-3 flex flex-col gap-3">
          {order.items.map((item, index) => (
            <li key={index} className="flex flex-col gap-0.5 text-sm sm:flex-row sm:items-center sm:justify-between sm:gap-3">
              <span className="min-w-0">
                {item.productName}
                <span className="text-foreground/60">
                  {" "}
                  — {item.colorName} / {item.sizeName} × {item.quantity}
                </span>
              </span>
              <span className="flex-none tabular-nums">{formatSatangAsThb(item.lineTotalSatang)}</span>
            </li>
          ))}
        </ul>
      </div>

      {order.shippingAddress && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">Shipping to</h2>
          <p className="mt-2 text-sm text-foreground/80">
            {order.customerName}
            <br />
            {order.shippingAddress.addressLine}, {order.shippingAddress.subdistrict},{" "}
            {order.shippingAddress.district}, {order.shippingAddress.province}{" "}
            {order.shippingAddress.postalCode}
          </p>
          {order.shippingMethodName && <p className="mt-1 text-sm text-foreground/60">{order.shippingMethodName}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5 border-t border-line pt-6 text-sm">
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

      {!expired && paymentHref && (
        <Link
          href={paymentHref}
          className="flex h-14 w-full items-center justify-center bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
        >
          Continue to Payment
        </Link>
      )}
    </div>
  );
}

function FulfillmentTimeline({ current }: { current: string }) {
  const currentIndex = FULFILLMENT_TIMELINE.indexOf(current as (typeof FULFILLMENT_TIMELINE)[number]);

  return (
    <div>
      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">Status</h2>
      <ol className="mt-3 flex flex-col gap-2">
        {FULFILLMENT_TIMELINE.map((step, index) => {
          const reached = currentIndex >= 0 && index <= currentIndex;
          return (
            <li key={step} className="flex items-center gap-3 text-sm">
              <span
                aria-hidden
                className={`h-2 w-2 flex-none rounded-full ${reached ? "bg-ink" : "bg-line"}`}
              />
              <span className={reached ? "text-foreground" : "text-foreground/40"}>
                {getFulfillmentStatusLabel(step)}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
