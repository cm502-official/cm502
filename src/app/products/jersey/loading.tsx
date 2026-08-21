/**
 * Route loading UI (§8) — shown instantly by Next.js while the server
 * component in page.tsx (and its now-cached but still-async catalog
 * fetch) resolves, so "SHOP NOW" never leaves the customer on a blank/
 * frozen screen. Deliberately mirrors page.tsx's actual layout
 * (JerseySelector's gallery + info-column grid, same breakpoints and
 * sizing) so there's no visible layout shift once the real content
 * swaps in — just static muted blocks in the existing CM502 dark
 * theme, no animation.
 */
export default function JerseyProductLoading() {
  return (
    <section className="mx-auto max-w-[1440px] px-4 py-4 sm:py-16 md:px-8 lg:px-10">
      <div className="flex flex-col gap-3 sm:gap-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(380px,2fr)] lg:items-start lg:gap-14">
        {/* Gallery placeholder — same box the real image (fill + priority) will occupy. */}
        <div
          aria-hidden
          className="h-[38vh] max-h-[380px] min-h-[240px] w-full bg-paper-dim sm:aspect-[4/5] sm:h-auto sm:max-h-none sm:min-h-0 lg:aspect-auto lg:h-[620px] xl:h-[700px] 2xl:h-[740px]"
        />

        <div className="flex flex-col gap-3 sm:gap-6 lg:sticky lg:top-24" aria-hidden>
          {/* Title */}
          <div className="h-9 w-2/3 bg-paper-dim sm:h-10 lg:h-12" />
          {/* Price */}
          <div className="h-6 w-40 bg-paper-dim" />

          {/* Color swatches */}
          <div className="flex gap-3">
            <div className="h-9 w-9 rounded-full bg-paper-dim" />
            <div className="h-9 w-9 rounded-full bg-paper-dim" />
            <div className="h-9 w-9 rounded-full bg-paper-dim" />
          </div>

          {/* Size row label */}
          <div className="h-4 w-24 bg-paper-dim" />

          {/* Quantity control */}
          <div className="h-12 w-40 bg-paper-dim" />

          {/* Primary CTA */}
          <div className="h-14 w-full bg-paper-dim" />
        </div>
      </div>
      <span className="sr-only">Loading CM502 Jersey…</span>
    </section>
  );
}
