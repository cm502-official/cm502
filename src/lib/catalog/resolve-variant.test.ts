import { describe, expect, it } from "vitest";
import {
  clampQuantity,
  getAvailableColors,
  getEffectivePriceSatang,
  getImagesForColor,
  getSizeStatesForColor,
  isColorSoldOut,
  resolveVariant,
} from "./resolve-variant";
import type { Color, ProductImage, Size, Variant } from "./types";

const BLACK: Color = { id: "color-black", name: "Black", hexCode: "#111", sortOrder: 1 };
const WHITE: Color = { id: "color-white", name: "White", hexCode: "#fff", sortOrder: 2 };
const PINK: Color = { id: "color-pink", name: "Pink", hexCode: "#D98CA3", sortOrder: 3 };
const BROWN: Color = { id: "color-brown", name: "Brown", hexCode: "#6B4226", sortOrder: 4 };
const NAVY: Color = { id: "color-navy", name: "Navy", hexCode: "#1B2A4A", sortOrder: 5 };
// Stand-in for a hidden legacy/placeholder color (e.g. "Cream") that must
// never appear in the customer-facing catalog once all its variants are
// deactivated, while still existing as a row for historical order safety.
const LEGACY: Color = { id: "color-legacy", name: "Legacy", hexCode: "#E8E1D3", sortOrder: 99 };

const SIZE_S: Size = { id: "size-s", name: "S", sortOrder: 1 };
const SIZE_M: Size = { id: "size-m", name: "M", sortOrder: 2 };
const SIZE_L: Size = { id: "size-l", name: "L", sortOrder: 3 };

function variant(overrides: Partial<Variant>): Variant {
  return {
    id: "variant-id",
    colorId: BLACK.id,
    sizeId: SIZE_M.id,
    sku: "SKU",
    priceSatangOverride: null,
    isActive: true,
    availableStock: 5,
    ...overrides,
  };
}

describe("resolveVariant", () => {
  const variants: Variant[] = [
    variant({ id: "v-black-s", colorId: BLACK.id, sizeId: SIZE_S.id }),
    variant({ id: "v-black-m", colorId: BLACK.id, sizeId: SIZE_M.id }),
    variant({ id: "v-white-s", colorId: WHITE.id, sizeId: SIZE_S.id, isActive: false }),
  ];

  it("resolves the correct variant for a color/size pair", () => {
    const result = resolveVariant(variants, BLACK.id, SIZE_S.id);
    expect(result?.id).toBe("v-black-s");
  });

  it("returns null when color or size is not selected", () => {
    expect(resolveVariant(variants, null, SIZE_S.id)).toBeNull();
    expect(resolveVariant(variants, BLACK.id, null)).toBeNull();
  });

  it("returns null for a sold-out-of-existence combination (no such variant row)", () => {
    expect(resolveVariant(variants, WHITE.id, SIZE_M.id)).toBeNull();
  });

  it("still resolves an inactive variant (caller decides what to do with it)", () => {
    const result = resolveVariant(variants, WHITE.id, SIZE_S.id);
    expect(result?.id).toBe("v-white-s");
    expect(result?.isActive).toBe(false);
  });
});

describe("getSizeStatesForColor", () => {
  const sizes = [SIZE_S, SIZE_M, SIZE_L];
  const variants: Variant[] = [
    variant({ id: "v-s", colorId: BLACK.id, sizeId: SIZE_S.id, availableStock: 3 }),
    variant({ id: "v-m", colorId: BLACK.id, sizeId: SIZE_M.id, availableStock: 0 }),
    variant({ id: "v-l", colorId: BLACK.id, sizeId: SIZE_L.id, isActive: false, availableStock: 5 }),
  ];

  it("marks a missing combination as disabled, not sold out", () => {
    const states = getSizeStatesForColor(variants, sizes, WHITE.id);
    for (const s of states) {
      expect(s.disabled).toBe(true);
      expect(s.soldOut).toBe(false);
      expect(s.variant).toBeNull();
    }
  });

  it("marks a zero-stock active variant as sold out and disabled", () => {
    const states = getSizeStatesForColor(variants, sizes, BLACK.id);
    const mState = states.find((s) => s.size.id === SIZE_M.id)!;
    expect(mState.soldOut).toBe(true);
    expect(mState.disabled).toBe(true);
  });

  it("marks an inactive variant as disabled but not sold out", () => {
    const states = getSizeStatesForColor(variants, sizes, BLACK.id);
    const lState = states.find((s) => s.size.id === SIZE_L.id)!;
    expect(lState.disabled).toBe(true);
    expect(lState.soldOut).toBe(false);
  });

  it("leaves an in-stock active variant enabled", () => {
    const states = getSizeStatesForColor(variants, sizes, BLACK.id);
    const sState = states.find((s) => s.size.id === SIZE_S.id)!;
    expect(sState.disabled).toBe(false);
    expect(sState.soldOut).toBe(false);
  });

  it("returns every size (not just ones with a variant) when no color is selected", () => {
    const states = getSizeStatesForColor(variants, sizes, null);
    expect(states).toHaveLength(3);
    expect(states.every((s) => s.disabled)).toBe(true);
  });
});

describe("getAvailableColors", () => {
  it("excludes colors with no active variant", () => {
    const variants: Variant[] = [
      variant({ colorId: BLACK.id, isActive: true }),
      variant({ colorId: WHITE.id, isActive: false }),
    ];
    const result = getAvailableColors(variants, [BLACK, WHITE]);
    expect(result.map((c) => c.id)).toEqual([BLACK.id]);
  });

  it("hides a legacy/placeholder color once every one of its variants is deactivated, without dropping the row", () => {
    // Mirrors the real Black/White/Pink/Brown/Navy + deactivated-Cream
    // catalog shape: the legacy color's variants all exist (so its order
    // history stays intact) but none are active.
    const variants: Variant[] = [
      variant({ colorId: BLACK.id, isActive: true }),
      variant({ colorId: WHITE.id, isActive: true }),
      variant({ colorId: PINK.id, isActive: true }),
      variant({ colorId: BROWN.id, isActive: true }),
      variant({ colorId: NAVY.id, isActive: true }),
      variant({ colorId: LEGACY.id, isActive: false }),
      variant({ colorId: LEGACY.id, isActive: false }),
    ];
    const result = getAvailableColors(variants, [BLACK, WHITE, PINK, BROWN, NAVY, LEGACY]);
    expect(result.map((c) => c.name)).toEqual(["Black", "White", "Pink", "Brown", "Navy"]);
    expect(result.some((c) => c.id === LEGACY.id)).toBe(false);
  });

  it("preserves the official Black/White/Pink/Brown/Navy display order driven by colors.sort_order", () => {
    // Colors passed in an arbitrary order — result must follow the order
    // of the input list (i.e. whatever the DB query's `order(sort_order)`
    // already produced), not re-sort or alphabetize.
    const orderedColors = [BLACK, WHITE, PINK, BROWN, NAVY];
    const variants: Variant[] = orderedColors.map((c) => variant({ colorId: c.id, isActive: true }));
    const result = getAvailableColors(variants, orderedColors);
    expect(result.map((c) => c.name)).toEqual(["Black", "White", "Pink", "Brown", "Navy"]);
  });
});

describe("isColorSoldOut", () => {
  it("is false for a color with no variants at all (not applicable / not shown)", () => {
    expect(isColorSoldOut([], BLACK.id)).toBe(false);
  });

  it("is false when at least one active variant has stock", () => {
    const variants: Variant[] = [
      variant({ colorId: BLACK.id, sizeId: "s", isActive: true, availableStock: 0 }),
      variant({ colorId: BLACK.id, sizeId: "m", isActive: true, availableStock: 3 }),
    ];
    expect(isColorSoldOut(variants, BLACK.id)).toBe(false);
  });

  it("is true when every active variant is at zero stock (current real-catalog state)", () => {
    const variants: Variant[] = [
      variant({ colorId: NAVY.id, sizeId: "s", isActive: true, availableStock: 0 }),
      variant({ colorId: NAVY.id, sizeId: "m", isActive: true, availableStock: 0 }),
    ];
    expect(isColorSoldOut(variants, NAVY.id)).toBe(true);
  });

  it("ignores inactive variants — a color isn't 'sold out' just because a disabled size exists", () => {
    const variants: Variant[] = [
      variant({ colorId: BLACK.id, sizeId: "s", isActive: false, availableStock: 0 }),
    ];
    expect(isColorSoldOut(variants, BLACK.id)).toBe(false);
  });
});

describe("getEffectivePriceSatang", () => {
  it("uses the base price when there is no variant or no override", () => {
    expect(getEffectivePriceSatang(99000, null)).toBe(99000);
    expect(getEffectivePriceSatang(99000, variant({ priceSatangOverride: null }))).toBe(99000);
  });

  it("uses the variant override when present", () => {
    expect(getEffectivePriceSatang(99000, variant({ priceSatangOverride: 89000 }))).toBe(89000);
  });

  it("respects a zero-satang override (falsy but valid)", () => {
    expect(getEffectivePriceSatang(99000, variant({ priceSatangOverride: 0 }))).toBe(0);
  });
});

describe("getImagesForColor", () => {
  const images: ProductImage[] = [
    { id: "1", colorId: BLACK.id, variantId: null, url: "black-front.jpg", altText: "", imageType: "front", sortOrder: 1 },
    { id: "2", colorId: BLACK.id, variantId: null, url: "black-back.jpg", altText: "", imageType: "back", sortOrder: 2 },
    { id: "3", colorId: WHITE.id, variantId: null, url: "white-front.jpg", altText: "", imageType: "front", sortOrder: 1 },
    { id: "4", colorId: null, variantId: null, url: "lifestyle.jpg", altText: "", imageType: "lifestyle", sortOrder: 0 },
  ];

  it("returns color-scoped images plus color-agnostic ones, sorted", () => {
    const result = getImagesForColor(images, BLACK.id);
    expect(result.map((i) => i.id)).toEqual(["4", "1", "2"]);
  });

  it("switches image sets when color changes", () => {
    const result = getImagesForColor(images, WHITE.id);
    expect(result.map((i) => i.id)).toEqual(["4", "3"]);
  });

  it("returns everything when no color is selected", () => {
    expect(getImagesForColor(images, null)).toHaveLength(4);
  });

  it("returns exactly one image for a color that only has a single primary photo (today's real catalog shape)", () => {
    const singleImagePerColor: ProductImage[] = [
      { id: "black-1", colorId: BLACK.id, variantId: null, url: "black/primary.jpg", altText: "CM502 Jersey – Black – Front", imageType: "front", sortOrder: 0 },
      { id: "navy-1", colorId: NAVY.id, variantId: null, url: "navy/primary.jpg", altText: "CM502 Jersey – Navy – Front", imageType: "front", sortOrder: 0 },
    ];
    const black = getImagesForColor(singleImagePerColor, BLACK.id);
    expect(black).toHaveLength(1);
    expect(black[0].url).toBe("black/primary.jpg");

    const navy = getImagesForColor(singleImagePerColor, NAVY.id);
    expect(navy).toHaveLength(1);
    expect(navy[0].url).toBe("navy/primary.jpg");
  });

  it("switching the selected color always resolves to that exact color's image, never another color's", () => {
    const perColor: ProductImage[] = [BLACK, WHITE, PINK, BROWN, NAVY].map((c, i) => ({
      id: `img-${c.id}`,
      colorId: c.id,
      variantId: null,
      url: `${c.name.toLowerCase()}/primary.jpg`,
      altText: `CM502 Jersey – ${c.name} – Front`,
      imageType: "front" as const,
      sortOrder: i,
    }));
    for (const color of [BLACK, WHITE, PINK, BROWN, NAVY]) {
      const result = getImagesForColor(perColor, color.id);
      expect(result).toHaveLength(1);
      expect(result[0].url).toBe(`${color.name.toLowerCase()}/primary.jpg`);
    }
  });
});

describe("clampQuantity", () => {
  it("floors below 1 up to 1", () => {
    expect(clampQuantity(0, 5)).toBe(1);
    expect(clampQuantity(-3, 5)).toBe(1);
  });

  it("caps at available stock", () => {
    expect(clampQuantity(10, 3)).toBe(3);
  });

  it("caps at the hard cap when stock is null (unknown)", () => {
    expect(clampQuantity(999, null)).toBe(10);
  });

  it("returns 0 when there is no stock at all", () => {
    expect(clampQuantity(1, 0)).toBe(0);
  });

  it("truncates fractional input", () => {
    expect(clampQuantity(2.9, 5)).toBe(2);
  });
});
