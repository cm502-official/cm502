/**
 * Pure catalog resolution logic — no I/O, fully unit-testable. The product
 * page UI calls these to turn a (color, size) selection into a concrete
 * variant, decide which sizes to disable, and pick the right image set.
 *
 * These functions are a UX convenience only. The server independently
 * re-validates the resolved variant_id against the database at checkout
 * time (§4/§17) — nothing here is trusted as authoritative.
 */
import type { Color, ProductImage, Size, Variant } from "./types";

/** Resolves the exact variant for a color+size pair, or null if none exists. */
export function resolveVariant(
  variants: Variant[],
  colorId: string | null,
  sizeId: string | null,
): Variant | null {
  if (!colorId || !sizeId) return null;
  return variants.find((v) => v.colorId === colorId && v.sizeId === sizeId) ?? null;
}

export interface SizeOptionState {
  size: Size;
  variant: Variant | null;
  /** No such variant, or it's inactive — never selectable. */
  disabled: boolean;
  /** A real, active variant that's simply out of stock. */
  soldOut: boolean;
}

/**
 * For a selected color, returns every size with its selectability state.
 * Sizes are shown in catalog order regardless of color so the control
 * doesn't jump around as the customer switches colors.
 */
export function getSizeStatesForColor(
  variants: Variant[],
  sizes: Size[],
  colorId: string | null,
): SizeOptionState[] {
  return sizes.map((size) => {
    const variant = colorId ? resolveVariant(variants, colorId, size.id) : null;
    if (!variant) {
      return { size, variant: null, disabled: true, soldOut: false };
    }
    if (!variant.isActive) {
      return { size, variant, disabled: true, soldOut: false };
    }
    const stock = variant.availableStock;
    const soldOut = stock !== null && stock <= 0;
    return { size, variant, disabled: soldOut, soldOut };
  });
}

/** Only colors that have at least one active, existing variant are selectable. */
export function getAvailableColors(variants: Variant[], colors: Color[]): Color[] {
  const activeColorIds = new Set(variants.filter((v) => v.isActive).map((v) => v.colorId));
  return colors.filter((c) => activeColorIds.has(c.id));
}

/**
 * True when a color has at least one active variant but every one of them
 * is out of stock — i.e. the color is shown (not hidden like an inactive
 * color) but nothing in it can currently be purchased.
 */
export function isColorSoldOut(variants: Variant[], colorId: string): boolean {
  const activeVariants = variants.filter((v) => v.colorId === colorId && v.isActive);
  if (activeVariants.length === 0) return false;
  return activeVariants.every((v) => v.availableStock !== null && v.availableStock <= 0);
}

/** Variant price override wins; otherwise the product's base price. */
export function getEffectivePriceSatang(basePriceSatang: number, variant: Variant | null): number {
  if (variant?.priceSatangOverride != null) return variant.priceSatangOverride;
  return basePriceSatang;
}

/**
 * Images scoped to the selected color, plus color-agnostic images
 * (color_id null), in sort order. Falls back to all images if no color is
 * selected yet.
 */
export function getImagesForColor(images: ProductImage[], colorId: string | null): ProductImage[] {
  const relevant = colorId
    ? images.filter((img) => img.colorId === colorId || img.colorId === null)
    : images;
  return [...relevant].sort((a, b) => a.sortOrder - b.sortOrder);
}

export function clampQuantity(quantity: number, maxStock: number | null, hardCap = 10): number {
  const ceiling = maxStock !== null ? Math.min(maxStock, hardCap) : hardCap;
  if (ceiling <= 0) return 0;
  return Math.max(1, Math.min(ceiling, Math.trunc(quantity)));
}
