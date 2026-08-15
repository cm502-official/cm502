import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getOrderByTrackingToken } from "@/lib/orders/get-order-by-token";
import { OrderDetailCard } from "@/components/orders/order-detail-card";

export const metadata: Metadata = {
  title: "Order Confirmation",
  robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const order = await getOrderByTrackingToken(token);

  if (!order) notFound();

  return (
    <section className="mx-auto max-w-2xl px-4 py-10 sm:px-6 sm:py-16">
      <OrderDetailCard order={order} paymentHref={`/orders/${token}/payment`} />
    </section>
  );
}
