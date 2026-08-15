"use client";

import { useState } from "react";
import type { OrderConfirmation } from "@/lib/orders/get-order-by-token";
import { OrderDetailCard } from "@/components/orders/order-detail-card";

type TrackedOrder = OrderConfirmation & { trackingToken: string };

const GENERIC_ERROR = "We couldn't find an order matching those details.";

export default function TrackOrderPage() {
  const [orderNumber, setOrderNumber] = useState("");
  const [phone, setPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState<TrackedOrder | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setOrder(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/track-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderNumber, phone }),
      });
      const body = await res.json().catch(() => null);

      if (!res.ok || !body?.order) {
        setError(body?.error?.message ?? GENERIC_ERROR);
        return;
      }
      setOrder(body.order as TrackedOrder);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  if (order) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
        <OrderDetailCard order={order} paymentHref={`/orders/${order.trackingToken}/payment`} />
        <button
          type="button"
          onClick={() => setOrder(null)}
          className="mt-8 text-xs font-medium uppercase tracking-wide text-foreground/50 underline underline-offset-4"
        >
          Track a different order
        </button>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-md px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl uppercase tracking-wide">Track Your Order</h1>
      <p className="mt-2 text-sm text-foreground/60">
        Enter your order number and the phone number used at checkout.
      </p>

      <form onSubmit={handleSubmit} noValidate className="mt-8 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="track-order-number" className="text-xs font-medium text-foreground/70">
            Order number
          </label>
          <input
            id="track-order-number"
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="CM502-20260815-0001"
            required
            className="h-12 border border-line bg-background px-3 text-sm outline-none focus:border-ink"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="track-order-phone" className="text-xs font-medium text-foreground/70">
            Phone number
          </label>
          <input
            id="track-order-phone"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="081-234-5678"
            required
            className="h-12 border border-line bg-background px-3 text-sm outline-none focus:border-ink"
          />
        </div>

        {error && (
          <p role="alert" className="border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={submitting}
          className="mt-2 h-14 w-full bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting ? "Searching…" : "Track Order"}
        </button>
      </form>
    </section>
  );
}
