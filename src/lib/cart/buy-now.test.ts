// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearBuyNowItems, getBuyNowItems, setBuyNowItems } from "./buy-now";
import type { CartItem } from "./schema";

const NAVY_ITEM: CartItem = {
  variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  productId: "3fa85f64-5717-4562-b3fc-2c963f66afa1",
  productSlug: "jersey",
  productName: "CM502 University Jersey",
  colorName: "Navy",
  sizeName: "M",
  sku: "CM502-JERSEY-NAVY-M",
  unitPriceSatang: 41900,
  imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/cm502-jersey/navy/primary.jpg",
  quantity: 1,
  customizations: [{ name: "LUCIFER", number: "88" }],
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("Buy Now — selected variant/color/image preservation", () => {
  it("round-trips a single item's exact variant id, color, size, quantity, and image", () => {
    setBuyNowItems([NAVY_ITEM]);
    const result = getBuyNowItems();
    expect(result).toEqual([NAVY_ITEM]);
  });

  it("round-trips a multi-size preorder batch (e.g. S×2 + M×3) as separate lines, preserving each shirt's customization", () => {
    const sItem: CartItem = {
      ...NAVY_ITEM,
      variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
      sizeName: "S",
      quantity: 2,
      unitPriceSatang: 37900,
      customizations: [
        { name: "LUCIFER", number: "88" },
        { name: "POND", number: "10" },
      ],
    };
    const mItem: CartItem = {
      ...NAVY_ITEM,
      variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa8",
      sizeName: "M",
      quantity: 3,
      unitPriceSatang: 37900,
      customizations: [
        { name: "JOHN", number: "7" },
        { name: null, number: null },
        { name: "MARK", number: "07" },
      ],
    };
    setBuyNowItems([sItem, mItem]);
    const result = getBuyNowItems();
    expect(result).toHaveLength(2);
    expect(result?.map((i) => i.sizeName)).toEqual(["S", "M"]);
    expect(result?.reduce((sum, i) => sum + i.quantity, 0)).toBe(5);
    expect(result?.[0].customizations).toEqual(sItem.customizations);
    expect(result?.[1].customizations).toEqual(mItem.customizations);
    // Leading-zero jersey number preserved exactly through sessionStorage round-trip.
    expect(result?.[1].customizations[2].number).toBe("07");
  });

  it("preserves the exact selected-color image for each of the five real colors", () => {
    const colors = ["Black", "White", "Pink", "Brown", "Navy"] as const;
    for (const colorName of colors) {
      const item: CartItem = {
        ...NAVY_ITEM,
        colorName,
        sku: `CM502-JERSEY-${colorName.toUpperCase()}-M`,
        imageUrl: `cm502-jersey/${colorName.toLowerCase()}/primary.jpg`,
      };
      setBuyNowItems([item]);
      expect(getBuyNowItems()?.[0]?.imageUrl).toBe(`cm502-jersey/${colorName.toLowerCase()}/primary.jpg`);
      expect(getBuyNowItems()?.[0]?.colorName).toBe(colorName);
    }
  });

  it("clears cleanly, leaving no stale items for the next checkout visit", () => {
    setBuyNowItems([NAVY_ITEM]);
    clearBuyNowItems();
    expect(getBuyNowItems()).toBeNull();
  });

  it("returns null instead of throwing on malformed sessionStorage data", () => {
    window.sessionStorage.setItem("cm502.buyNow.v2", "{not valid json");
    expect(() => getBuyNowItems()).not.toThrow();
    expect(getBuyNowItems()).toBeNull();
  });

  it("ignores an empty array rather than persisting a stale empty batch", () => {
    setBuyNowItems([]);
    expect(getBuyNowItems()).toBeNull();
  });

  it("rejects an item whose customizations.length doesn't match quantity (schema refine)", () => {
    window.sessionStorage.setItem(
      "cm502.buyNow.v2",
      JSON.stringify({ version: 2, items: [{ ...NAVY_ITEM, quantity: 3, customizations: [{ name: null, number: null }] }] }),
    );
    expect(getBuyNowItems()).toBeNull();
  });
});
