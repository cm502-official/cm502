"use client";

import { Overlay } from "@/components/ui/overlay";
import { ShirtCustomizationEditor } from "./shirt-customization-editor";
import type { Color, Size } from "@/lib/catalog/types";
import type { ShirtDraft } from "@/lib/customization/shirt-draft";

/**
 * "ระบุรายละเอียดเสื้อ" overlay (§3) — reuses the shared Overlay so it
 * closes identically to the pricing/size-chart modals (Escape, backdrop
 * click, × button), never navigates, never opens a new tab. Wider than
 * the other overlays since it needs to comfortably hold a multi-row
 * table even for large (30+) orders.
 */
export function CustomizationModal({
  open,
  onClose,
  drafts,
  onDraftsChange,
  colors,
  sizes,
  canSave,
  onSaveAndAddToCart,
  onBuyNow,
  saveLabel = "บันทึกและเพิ่มลงตะกร้า",
  title = "รายละเอียดเสื้อ",
  quantityEditable,
  onQuantityChange,
}: {
  open: boolean;
  onClose: () => void;
  drafts: ShirtDraft[];
  onDraftsChange: (drafts: ShirtDraft[]) => void;
  colors: Color[];
  sizes: Size[];
  canSave: boolean;
  onSaveAndAddToCart: () => void;
  /** Omit to hide the secondary Buy Now action (e.g. when editing an existing cart line). */
  onBuyNow?: () => void;
  saveLabel?: string;
  title?: string;
  /**
   * Shows a quantity stepper above the editor (§ cart quantity editing) —
   * used when editing an existing cart line, where the product page's
   * external quantity control isn't available. The product-page "create"
   * flow already chose quantity before opening this modal, so it omits
   * this prop entirely rather than showing a second, redundant control.
   */
  quantityEditable?: boolean;
  onQuantityChange?: (next: number) => void;
}) {
  return (
    <Overlay open={open} onClose={onClose} title={title} wide>
      {quantityEditable && onQuantityChange && (
        <div className="mb-4 flex items-center justify-between border-b border-line pb-4">
          <span className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
            จำนวนเสื้อ
          </span>
          <div className="inline-flex items-center border border-line" role="group" aria-label="Edit quantity">
            <button
              type="button"
              onClick={() => onQuantityChange(drafts.length - 1)}
              disabled={drafts.length <= 1}
              aria-label="Decrease quantity"
              className="flex h-10 w-10 items-center justify-center text-lg disabled:opacity-30"
            >
              −
            </button>
            <span className="flex h-10 min-w-10 items-center justify-center px-2 text-sm font-medium tabular-nums">
              {drafts.length}
            </span>
            <button
              type="button"
              onClick={() => onQuantityChange(drafts.length + 1)}
              aria-label="Increase quantity"
              className="flex h-10 w-10 items-center justify-center text-lg"
            >
              +
            </button>
          </div>
        </div>
      )}
      <ShirtCustomizationEditor drafts={drafts} onChange={onDraftsChange} colors={colors} sizes={sizes} />

      <div className="sticky bottom-0 -mx-5 mt-6 flex flex-col gap-3 border-t border-line bg-background px-5 pb-1 pt-4 sm:flex-row">
        <button
          type="button"
          onClick={onSaveAndAddToCart}
          disabled={!canSave}
          className="h-12 flex-1 bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
        >
          {saveLabel}
        </button>
        {onBuyNow && (
          <button
            type="button"
            onClick={onBuyNow}
            disabled={!canSave}
            className="h-12 flex-1 border border-ink text-sm font-semibold uppercase tracking-[0.15em] transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Buy Now
          </button>
        )}
      </div>
    </Overlay>
  );
}
