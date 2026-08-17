"use client";

import { useState } from "react";
import Image from "next/image";
import type { ProductImage } from "@/lib/catalog/types";

/**
 * Swipeable gallery (CSS scroll-snap — works natively with touch, no
 * carousel dependency) with a thumbnail rail for desktop. When there are
 * no images yet (seed data ships with none — real CM502 photography lands
 * later per the project brief) it shows a deliberately plain placeholder
 * instead of inventing product photography.
 */
export function ProductGallery({ images, productName }: { images: ProductImage[]; productName: string }) {
  const [activeIndex, setActiveIndex] = useState(0);
  // Reset to the first image whenever the image set changes (e.g. color
  // switch) — adjusting state during render per React's guidance, instead
  // of an effect, since this is state derived from a prop change.
  const [imagesForActiveIndex, setImagesForActiveIndex] = useState(images);
  // Per-image load-failure tracking (§17): one bad record must never
  // crash the page or show a broken-image icon — it falls back to the
  // plain placeholder tile instead, keyed by image id so a color switch
  // (new image set) clears any stale failures.
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  if (images !== imagesForActiveIndex) {
    setImagesForActiveIndex(images);
    setActiveIndex(0);
    if (failedIds.size > 0) setFailedIds(new Set());
  }

  if (images.length === 0) {
    return <PlaceholderGallery productName={productName} />;
  }

  function markFailed(id: string) {
    setFailedIds((prev) => (prev.has(id) ? prev : new Set(prev).add(id)));
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse sm:gap-4">
      <div
        // Mobile: a compact, capped height (not a portrait aspect ratio)
        // so the shirt, title, price, and color picker all fit in the
        // first viewport without scrolling — object-contain below still
        // letterboxes the full garment with no cropping. Tablet/desktop
        // (sm+) restore the larger portrait presentation, switching to an
        // explicit height at lg so a wide left column never turns into a
        // very tall media block — capped well under 75vh at every
        // breakpoint.
        className="flex h-[38vh] max-h-[380px] min-h-[240px] w-full snap-x snap-mandatory gap-0 overflow-x-auto sm:aspect-[4/5] sm:h-auto sm:max-h-none sm:min-h-0 lg:aspect-auto lg:h-[620px] xl:h-[700px] 2xl:h-[740px]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const index = Math.round(el.scrollLeft / el.clientWidth);
          if (index !== activeIndex) setActiveIndex(index);
        }}
      >
        {images.map((image, index) =>
          failedIds.has(image.id) ? (
            <div key={image.id} className="relative w-full flex-none snap-center">
              <PlaceholderGallery productName={productName} />
            </div>
          ) : (
            <div
              key={image.id}
              className="relative w-full flex-none snap-center bg-paper-dim p-2 sm:p-6 lg:p-8"
            >
              {/* object-contain (not cover) so the full garment is always
                  visible with breathing room — a cropped, oversized shirt
                  reads as low-budget on a premium storefront. */}
              <Image
                src={image.url}
                alt={image.altText || `${productName} — image ${index + 1}`}
                fill
                sizes="(min-width: 640px) 50vw, 100vw"
                className="object-contain object-center"
                priority={index === 0}
                onError={() => markFailed(image.id)}
              />
            </div>
          ),
        )}
      </div>

      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto sm:w-20 sm:flex-col sm:overflow-visible">
          {images.map((image, index) => (
            <button
              key={image.id}
              type="button"
              onClick={() => setActiveIndex(index)}
              aria-label={`Show image ${index + 1} of ${images.length}`}
              aria-current={activeIndex === index}
              className={`relative aspect-square w-16 flex-none border sm:w-full ${
                activeIndex === index ? "border-ink" : "border-line"
              }`}
            >
              {failedIds.has(image.id) ? (
                <span className="absolute inset-0 flex items-center justify-center bg-paper-dim text-[10px] uppercase tracking-wide text-ink/30">
                  CM502
                </span>
              ) : (
                <span className="absolute inset-0 bg-paper-dim p-1.5">
                  <Image
                    src={image.url}
                    alt=""
                    fill
                    sizes="80px"
                    className="object-contain object-center"
                    onError={() => markFailed(image.id)}
                  />
                </span>
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function PlaceholderGallery({ productName }: { productName: string }) {
  return (
    <div
      className="relative flex h-[38vh] max-h-[380px] min-h-[240px] w-full flex-col items-center justify-center gap-3 border border-line bg-paper-dim sm:aspect-[4/5] sm:h-auto sm:max-h-none sm:min-h-0 lg:aspect-auto lg:h-[620px] xl:h-[700px] 2xl:h-[740px]"
      role="img"
      aria-label={`${productName} — product photography coming soon`}
    >
      <p className="font-display text-4xl tracking-[0.1em] text-ink/25 sm:text-5xl">CM502</p>
      <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Photography coming soon</p>
    </div>
  );
}
