"use client";

import { useState } from "react";
import Image from "next/image";
import type { CartItem } from "@/lib/cart/schema";
import { formatSatangAsThb } from "@/lib/money";

export function CartItemRow({
  item,
  unitPriceSatang,
  onEdit,
  onRemove,
}: {
  item: CartItem;
  /**
   * Combined-cart tier price (§ jersey-tiers), passed down from the cart
   * page rather than read off `item.unitPriceSatang` directly — the
   * store already keeps that field in sync after every mutation, but
   * this line never has to assume that; it always renders whatever the
   * cart page just computed from the live total quantity.
   */
  unitPriceSatang: number;
  onEdit: () => void;
  onRemove: () => void;
}) {
  const lineTotal = unitPriceSatang * item.quantity;
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
              {item.colorName} / {item.sizeName} · {item.quantity} ตัว
            </p>
          </div>
          <p className="text-sm font-medium tabular-nums">{formatSatangAsThb(lineTotal)}</p>
        </div>

        <p className="text-xs text-foreground/50 tabular-nums">
          {formatSatangAsThb(unitPriceSatang)} each
        </p>

        {/* Per-shirt personalization (§17) — the data stays individual
            even though the line is grouped by variant for display. */}
        <ol className="mt-1.5 flex flex-col gap-0.5 text-xs text-foreground/70">
          {item.customizations.map((c, index) => (
            <li key={index} className="tabular-nums">
              {index + 1}. {c.name ?? "ไม่ระบุชื่อ"} · #{c.number ?? "ไม่ระบุเบอร์"}
            </li>
          ))}
        </ol>

        <div className="mt-2 flex items-center gap-4">
          <button
            type="button"
            onClick={onEdit}
            className="text-xs font-medium uppercase tracking-wide text-foreground/70 underline underline-offset-4 transition-colors hover:text-foreground"
          >
            แก้ไขรายละเอียดเสื้อ
          </button>
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
