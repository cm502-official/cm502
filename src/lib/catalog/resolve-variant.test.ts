import { describe, expect, it } from "vitest";
import {
  clampQuantity,
  getAvailableColors,
  getEffectivePriceSatang,
  getImagesForColor,
  getSizeStatesForColor,
  resolveVariant,
} from "./resolve-variant";
import type { Color, ProductImage, Size, Variant } from "./types";

const BLACK: Color = { id: "color-black", name: "Black", hexCode: "#111", sortOrder: 1 };
const WHITE: Color = { id: "color-white", name: "White", hexCode: "#fff", sortOrder: 2 };

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
