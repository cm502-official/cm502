import type { Metadata } from "next";
import { getShippingMethods } from "@/lib/shipping/get-shipping-methods";
import { CheckoutForm } from "@/components/checkout/checkout-form";

export const metadata: Metadata = {
  title: "Checkout",
};

export default async function CheckoutPage() {
  const shippingMethods = await getShippingMethods();

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl uppercase tracking-wide sm:text-4xl">Checkout</h1>
      <div className="mt-8">
        <CheckoutForm shippingMethods={shippingMethods} />
      </div>
    </section>
  );
}
