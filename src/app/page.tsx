import Link from "next/link";

export default function HomePage() {
  return (
    <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col justify-end overflow-hidden bg-ink text-paper">
      {/* No product photography in the hero — deliberately. A clean dark
          gradient + strong typography carries the brand instead. No
          fabricated claims, reviews, counts, or discounts are added.
          Real CM502 jersey photography still lives on /products/jersey,
          driven by the live catalog (Supabase Storage / product_images) —
          this page has no image, and therefore no priority-loaded image,
          to worry about for LCP. */}
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_90%_at_50%_100%,var(--color-ink-soft)_0%,var(--color-ink)_55%)]"
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-32 sm:px-6 sm:pb-24">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-paper/60">
          Now available
        </p>
        <h1 className="font-display text-[18vw] leading-[0.85] tracking-tight sm:text-[10vw] lg:text-[8rem]">
          CM502
        </h1>

        <div>
          <Link
            href="/products/jersey"
            className="inline-flex items-center justify-center bg-paper px-8 py-4 text-sm font-semibold uppercase tracking-[0.2em] text-ink transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0"
          >
            Shop Now
          </Link>
        </div>
      </div>
    </section>
  );
}
