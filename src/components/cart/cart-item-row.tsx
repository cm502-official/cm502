"use client";

import { useState } from "react";
import Image from "next/image";
import type { CartItem } from "@/lib/cart/schema";
import { formatSatangAsThb } from "@/lib/money";
import { QuantityInput } from "@/components/ui/quantity-input";

export function CartItemRow({
  item,
  onQuantityChange,
  onRemove,
}: {
  item: CartItem;
  onQuantityChange: (quantity: number) => void;
  onRemove: () => void;
}) {
  const lineTotal = item.unitPriceSatang * item.quantity;
  // A bad/expired image URL must never surface a broken-image icon — fall
  // back to the same plain CM502 placeholder used when there's no image
  // at all.
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="flex gap-4 border-b border-line py-5 first:pt-0 last:border-b-0">
      <div className="relative h-24 w-20 flex-none bg-paper-dim">
        {item.imageUrl && !imageFailed ? (
          <Image
            src={item.imageUrl}
            alt={`${item.productName} – ${item.colorName}`}
            fill
            sizes="80px"
            className="object-cover"
            onError={() => setImageFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className="font-display text-sm text-ink/25">CM502</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-medium">{item.productName}</p>
            <p className="text-xs text-foreground/60">
              {item.colorName} / {item.sizeName}
            </p>
          </div>
          <p className="text-sm font-medium tabular-nums">{formatSatangAsThb(lineTotal)}</p>
        </div>

        <p className="text-xs text-foreground/50 tabular-nums">
          {formatSatangAsThb(item.unitPriceSatang)} each
        </p>

        <div className="mt-2 flex items-center justify-between">
          <QuantityInput value={item.quantity} max={10} onChange={onQuantityChange} />
          <button
            type="button"
            onClick={onRemove}
            className="text-xs font-medium uppercase tracking-wide text-foreground/50 underline underline-offset-4 transition-colors hover:text-accent"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}
