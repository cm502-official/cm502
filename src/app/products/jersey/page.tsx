import type { Metadata } from "next";
import { getJerseyProduct } from "@/lib/catalog/get-jersey-product";
import { JerseySelector } from "@/components/product/jersey-selector";

export const metadata: Metadata = {
  title: "University Jersey",
  description: "CM502 University Jersey — choose your color and size.",
};

export default async function JerseyProductPage() {
  const product = await getJerseyProduct();

  if (!product) {
    return (
      <section className="mx-auto max-w-2xl px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-3xl uppercase tracking-wide">Coming soon</h1>
        <p className="mt-4 text-sm text-foreground/70">
          The CM502 jersey isn&apos;t available right now. Please check back shortly.
        </p>
      </section>
    );
  }

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: product.description ?? undefined,
    offers: {
      "@type": "Offer",
      priceCurrency: "THB",
      price: (product.basePriceSatang / 100).toFixed(2),
      availability: "https://schema.org/InStock",
    },
  };

  return (
    <section className="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-16">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <JerseySelector product={product} />
    </section>
  );
}
