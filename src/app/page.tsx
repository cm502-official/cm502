import Image from "next/image";
import Link from "next/link";

export default function HomePage() {
  return (
    <section className="relative flex min-h-[calc(100dvh-4rem)] flex-col justify-end overflow-hidden bg-ink text-paper">
      {/* Real CM502 jersey photography as the hero backdrop — this is the
          page's LCP element, so it's the one image on the site allowed
          `priority` (§18). A dark gradient sits over it for text contrast;
          no fabricated claims, reviews, counts, or discounts are added.

          Asset choice: a static copy in /public rather than a Supabase
          Storage fetch, deliberately. The homepage is a static server
          component with no catalog data dependency today — pulling the
          hero from Storage would mean adding a live DB round-trip (and a
          new failure mode: home page breaks if that catalog row/image
          changes or is deleted) purely to display a decorative, largely
          static hero image. The source of truth for the *catalog* image
          (product/black.jpg → Storage → product_images) is untouched;
          this is a one-time copy of the same asset for a purely
          presentational, catalog-independent use. If the hero needs to
          rotate/change without a code deploy later, revisit and drive it
          from Storage instead. */}
      <Image
        src="/images/cm502-jersey-black-hero.jpg"
        alt="CM502 University Jersey – Black"
        fill
        priority
        sizes="100vw"
        className="object-cover object-center"
      />
      <div
        aria-hidden
        className="absolute inset-0 bg-[radial-gradient(120%_100%_at_50%_100%,rgba(0,0,0,0.15)_0%,rgba(0,0,0,0.85)_65%)]"
      />

      <div className="relative mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 pb-16 pt-32 sm:px-6 sm:pb-24">
        <p className="text-xs font-medium uppercase tracking-[0.3em] text-paper/60">
          Now available
        </p>
        <h1 className="font-display text-[18vw] leading-[0.85] tracking-tight sm:text-[10vw] lg:text-[8rem]">
          CM502
        </h1>
        <p className="font-display text-2xl uppercase tracking-[0.15em] text-paper/85 sm:text-3xl">
          University Jersey
        </p>

        <div className="mt-6">
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
