// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { clearBuyNowItem, getBuyNowItem, setBuyNowItem } from "./buy-now";
import type { CartItem } from "./schema";

const NAVY_ITEM: CartItem = {
  variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  productId: "3fa85f64-5717-4562-b3fc-2c963f66afa1",
  productSlug: "jersey",
  productName: "CM502 University Jersey",
  colorName: "Navy",
  sizeName: "M",
  sku: "CM502-JERSEY-NAVY-M",
  unitPriceSatang: 99000,
  imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/cm502-jersey/navy/primary.jpg",
  quantity: 1,
};

beforeEach(() => {
  window.sessionStorage.clear();
});

describe("Buy Now — selected variant/color/image preservation", () => {
  it("round-trips the exact variant id, color, size, quantity, and image through the checkout hand-off", () => {
    setBuyNowItem(NAVY_ITEM);
    const result = getBuyNowItem();
    expect(result).toEqual(NAVY_ITEM);
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
      setBuyNowItem(item);
      expect(getBuyNowItem()?.imageUrl).toBe(`cm502-jersey/${colorName.toLowerCase()}/primary.jpg`);
      expect(getBuyNowItem()?.colorName).toBe(colorName);
    }
  });

  it("clears cleanly, leaving no stale item for the next checkout visit", () => {
    setBuyNowItem(NAVY_ITEM);
    clearBuyNowItem();
    expect(getBuyNowItem()).toBeNull();
  });

  it("returns null instead of throwing on malformed sessionStorage data", () => {
    window.sessionStorage.setItem("cm502.buyNow.v1", "{not valid json");
    expect(() => getBuyNowItem()).not.toThrow();
    expect(getBuyNowItem()).toBeNull();
  });
});
