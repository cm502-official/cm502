"use client";

import { Overlay } from "@/components/ui/overlay";
import { TierPricingTable } from "./tier-pricing-table";
import { getJerseyUnitPriceSatang } from "@/lib/pricing/jersey-tiers";
import { formatSatangAsThb } from "@/lib/money";

/**
 * "ดูราคาตามจำนวน" overlay (§3/§4) — the full tier table lives only here,
 * not in the default product-page view. The worked example is computed
 * from the same getJerseyUnitPriceSatang() the rest of the app uses, so
 * it can never drift from the real tier table.
 */
export function PricingModal({
  open,
  onClose,
  totalQuantity,
}: {
  open: boolean;
  onClose: () => void;
  totalQuantity: number;
}) {
  const examplePrice = formatSatangAsThb(getJerseyUnitPriceSatang(10));

  return (
    <Overlay open={open} onClose={onClose} title="ราคาตามจำนวน">
      <TierPricingTable totalQuantity={totalQuantity} />
      <p className="mt-4 text-xs leading-relaxed text-foreground/60">
        ราคาต่อชิ้นจะคำนวณจากจำนวนเสื้อรวมทั้งหมดในคำสั่งซื้อ
        <br />
        ตัวอย่าง: สั่งรวม 10 ตัว ทุกไซซ์รวมกัน จะคิดราคา {examplePrice} ต่อชิ้น
      </p>
    </Overlay>
  );
}
