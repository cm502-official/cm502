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
  if (images !== imagesForActiveIndex) {
    setImagesForActiveIndex(images);
    setActiveIndex(0);
  }

  if (images.length === 0) {
    return <PlaceholderGallery productName={productName} />;
  }

  return (
    <div className="flex flex-col gap-3 sm:flex-row-reverse sm:gap-4">
      <div
        className="flex aspect-[4/5] w-full snap-x snap-mandatory gap-0 overflow-x-auto sm:aspect-[4/5]"
        onScroll={(e) => {
          const el = e.currentTarget;
          const index = Math.round(el.scrollLeft / el.clientWidth);
          if (index !== activeIndex) setActiveIndex(index);
        }}
      >
        {images.map((image, index) => (
          <div key={image.id} className="relative w-full flex-none snap-center bg-paper-dim">
            <Image
              src={image.url}
              alt={image.altText || `${productName} — image ${index + 1}`}
              fill
              sizes="(min-width: 640px) 50vw, 100vw"
              className="object-cover"
              priority={index === 0}
            />
          </div>
        ))}
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
              <Image
                src={image.url}
                alt=""
                fill
                sizes="80px"
                className="object-cover"
              />
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
      className="relative flex aspect-[4/5] w-full flex-col items-center justify-center gap-3 border border-line bg-paper-dim"
      role="img"
      aria-label={`${productName} — product photography coming soon`}
    >
      <p className="font-display text-4xl tracking-[0.1em] text-ink/25 sm:text-5xl">CM502</p>
      <p className="text-xs uppercase tracking-[0.2em] text-ink/40">Photography coming soon</p>
    </div>
  );
}
