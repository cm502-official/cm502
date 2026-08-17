"use client";

import { JERSEY_PRICE_TIERS, getActiveTierMinQuantity } from "@/lib/pricing/jersey-tiers";
import { formatSatangAsThb } from "@/lib/money";

function tierLabel(minQuantity: number, maxQuantity: number | null): string {
  if (maxQuantity === null) return `${minQuantity} ตัวขึ้นไป`;
  return `${minQuantity}–${maxQuantity} ตัว`;
}

/**
 * Volume-discount table — rendered inside the "ดูราคาตามจำนวน" overlay
 * (pricing-modal.tsx), not directly on the product page (§1). The tier
 * that applies to the customer's current selection is visually called
 * out via `totalQuantity`.
 */
export function TierPricingTable({ totalQuantity }: { totalQuantity: number }) {
  const activeMin = getActiveTierMinQuantity(totalQuantity);

  return (
    <ul className="divide-y divide-line border border-line">
      {JERSEY_PRICE_TIERS.slice()
        .reverse()
        .map((tier) => {
          const active = tier.minQuantity === activeMin && totalQuantity > 0;
          return (
            <li
              key={tier.minQuantity}
              className={`flex items-center justify-between px-4 py-2.5 text-sm ${
                active ? "bg-foreground/10 font-medium" : "text-foreground/80"
              }`}
            >
              <span>{tierLabel(tier.minQuantity, tier.maxQuantity)}</span>
              <span className="tabular-nums">{formatSatangAsThb(tier.unitPriceSatang)} / ตัว</span>
            </li>
          );
        })}
    </ul>
  );
}
