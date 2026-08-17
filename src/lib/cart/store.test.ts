// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import { CART_STORAGE_KEY } from "./schema";
import {
  __reloadCartFromStorageForTests,
  __resetCartForTests,
  addToCart,
  clearCart,
  getCartSnapshot,
  removeFromCart,
  setLineCustomizations,
} from "./store";

const ITEM_A = {
  variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  productId: "3fa85f64-5717-4562-b3fc-2c963f66afa1",
  productSlug: "jersey",
  productName: "CM502 University Jersey",
  colorName: "Black",
  sizeName: "M",
  sku: "CM502-JERSEY-BLACK-M",
  unitPriceSatang: 99000,
  imageUrl: null,
};

const ITEM_B = {
  ...ITEM_A,
  variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
  sizeName: "L",
  sku: "CM502-JERSEY-BLACK-L",
};

const CUSTOM_1 = { name: "LUCIFER", number: "88" };
const CUSTOM_2 = { name: "POND", number: "10" };
const CUSTOM_BLANK = { name: null, number: null };

function customizations(n: number) {
  return Array.from({ length: n }, () => ({ ...CUSTOM_BLANK }));
}

beforeEach(() => {
  window.localStorage.clear();
  __resetCartForTests();
});

describe("addToCart", () => {
  it("adds a new item with one customization per shirt", () => {
    addToCart(ITEM_A, [CUSTOM_1]);
    expect(getCartSnapshot().items).toHaveLength(1);
    expect(getCartSnapshot().items[0].quantity).toBe(1);
    expect(getCartSnapshot().items[0].customizations).toEqual([CUSTOM_1]);
  });

  it("derives quantity from customizations.length, not a separate argument", () => {
    addToCart(ITEM_A, [CUSTOM_1, CUSTOM_2, CUSTOM_BLANK]);
    expect(getCartSnapshot().items[0].quantity).toBe(3);
  });

  it("merges into an existing line for the same variant, CONCATENATING customizations", () => {
    addToCart(ITEM_A, [CUSTOM_1]);
    addToCart(ITEM_A, [CUSTOM_2]);
    const items = getCartSnapshot().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(2);
    expect(items[0].customizations).toEqual([CUSTOM_1, CUSTOM_2]);
  });

  it("never collapses two shirts of the same variant with different names into one indistinguishable unit", () => {
    addToCart(ITEM_A, [CUSTOM_1, CUSTOM_2]);
    const items = getCartSnapshot().items;
    expect(items[0].customizations).toHaveLength(2);
    expect(items[0].customizations[0]).toEqual(CUSTOM_1);
    expect(items[0].customizations[1]).toEqual(CUSTOM_2);
  });

  it("keeps different variants as separate lines", () => {
    addToCart(ITEM_A, [CUSTOM_1]);
    addToCart(ITEM_B, [CUSTOM_2]);
    expect(getCartSnapshot().items).toHaveLength(2);
  });

  it("allows large bulk-preorder quantities — no stock-derived cap", () => {
    addToCart(ITEM_A, customizations(999));
    expect(getCartSnapshot().items[0].quantity).toBe(999);
  });

  it("preserves a leading-zero jersey number exactly (never coerced to a number)", () => {
    addToCart(ITEM_A, [{ name: "SMITH", number: "07" }]);
    expect(getCartSnapshot().items[0].customizations[0].number).toBe("07");
  });

  it("is a no-op when given zero customizations", () => {
    addToCart(ITEM_A, []);
    expect(getCartSnapshot().items).toHaveLength(0);
  });

  it("persists to localStorage", () => {
    addToCart(ITEM_A, [CUSTOM_1]);
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).items).toHaveLength(1);
    expect(JSON.parse(raw!).items[0].customizations).toEqual([CUSTOM_1]);
  });
});

describe("setLineCustomizations — edit from cart (§18)", () => {
  it("replaces the full customization list and updates quantity accordingly", () => {
    addToCart(ITEM_A, [CUSTOM_1]);
    setLineCustomizations(ITEM_A.variantId, [CUSTOM_1, CUSTOM_2]);
    const items = getCartSnapshot().items;
    expect(items[0].quantity).toBe(2);
    expect(items[0].customizations).toEqual([CUSTOM_1, CUSTOM_2]);
  });

  it("removes the line entirely when given an empty array", () => {
    addToCart(ITEM_A, [CUSTOM_1]);
    setLineCustomizations(ITEM_A.variantId, []);
    expect(getCartSnapshot().items).toHaveLength(0);
  });
});

describe("removeFromCart / clearCart", () => {
  it("removes a single line", () => {
    addToCart(ITEM_A, [CUSTOM_1]);
    addToCart(ITEM_B, [CUSTOM_2]);
    removeFromCart(ITEM_A.variantId);
    expect(getCartSnapshot().items).toHaveLength(1);
    expect(getCartSnapshot().items[0].variantId).toBe(ITEM_B.variantId);
  });

  it("empties the whole cart", () => {
    addToCart(ITEM_A, [CUSTOM_1]);
    addToCart(ITEM_B, [CUSTOM_2]);
    clearCart();
    expect(getCartSnapshot().items).toHaveLength(0);
  });
});

describe("combined-quantity tier repricing (§ jersey-tiers)", () => {
  it("prices every line at the tier for the COMBINED cart quantity, not per line", () => {
    addToCart(ITEM_A, customizations(2)); // 2 total → 419 THB tier
    addToCart(ITEM_B, customizations(3)); // 2 + 3 = 5 total → 379 THB tier, both lines re-priced
    const items = getCartSnapshot().items;
    expect(items.every((i) => i.unitPriceSatang === 37900)).toBe(true);
  });

  it("automatically recalculates every remaining line when quantity drops across a tier boundary", () => {
    addToCart(ITEM_A, customizations(10)); // 10 total → 349 THB tier
    expect(getCartSnapshot().items[0].unitPriceSatang).toBe(34900);

    setLineCustomizations(ITEM_A.variantId, customizations(9)); // 9 total → 379 THB tier
    expect(getCartSnapshot().items[0].unitPriceSatang).toBe(37900);
  });

  it("§ cart quantity editing: crossing 9 → 10 immediately reprices every line from ฿379 to ฿349", () => {
    addToCart(ITEM_A, customizations(9));
    expect(getCartSnapshot().items[0].unitPriceSatang).toBe(37900);

    setLineCustomizations(ITEM_A.variantId, customizations(10));
    expect(getCartSnapshot().items[0].unitPriceSatang).toBe(34900);
  });

  it("re-prices remaining lines after removing one that pushes the total below a tier boundary", () => {
    addToCart(ITEM_A, customizations(3)); // running total 3
    addToCart(ITEM_B, customizations(2)); // running total 5 → 379 THB tier
    expect(getCartSnapshot().items.every((i) => i.unitPriceSatang === 37900)).toBe(true);

    removeFromCart(ITEM_B.variantId); // back down to 3 → 399 THB tier
    expect(getCartSnapshot().items[0].unitPriceSatang).toBe(39900);
  });

  it("30-shirt order still resolves to the 20-49 tier (฿299) across the whole cart", () => {
    addToCart(ITEM_A, customizations(30));
    expect(getCartSnapshot().items[0].unitPriceSatang).toBe(29900);
  });
});

describe("selected-color image propagation", () => {
  it("preserves the exact selected-color imageUrl through add-to-cart and persistence", () => {
    const navyItem = {
      ...ITEM_A,
      variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa8",
      colorName: "Navy",
      sku: "CM502-JERSEY-NAVY-M",
      imageUrl: "https://example.supabase.co/storage/v1/object/public/product-images/cm502-jersey/navy/primary.jpg",
    };
    addToCart(navyItem, [CUSTOM_1]);
    expect(getCartSnapshot().items[0].imageUrl).toBe(navyItem.imageUrl);

    // Round-trips through localStorage exactly — checkout/cart reads must
    // never fall back to some other color's image.
    const persisted = JSON.parse(window.localStorage.getItem(CART_STORAGE_KEY)!);
    expect(persisted.items[0].imageUrl).toBe(navyItem.imageUrl);
  });

  it("keeps each color's own image when multiple colors are in the cart at once", () => {
    const pinkItem = {
      ...ITEM_A,
      variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa9",
      colorName: "Pink",
      sku: "CM502-JERSEY-PINK-M",
      imageUrl: "pink/primary.jpg",
    };
    const brownItem = {
      ...ITEM_A,
      variantId: "3fa85f64-5717-4562-b3fc-2c963f66afaa",
      colorName: "Brown",
      sku: "CM502-JERSEY-BROWN-M",
      imageUrl: "brown/primary.jpg",
    };
    addToCart(pinkItem, [CUSTOM_1]);
    addToCart(brownItem, [CUSTOM_2]);

    const items = getCartSnapshot().items;
    expect(items.find((i) => i.variantId === pinkItem.variantId)?.imageUrl).toBe("pink/primary.jpg");
    expect(items.find((i) => i.variantId === brownItem.variantId)?.imageUrl).toBe("brown/primary.jpg");
  });
});

describe("malformed localStorage recovery", () => {
  it("recovers from invalid JSON without throwing, falling back to an empty cart", () => {
    window.localStorage.setItem(CART_STORAGE_KEY, "{not valid json");
    expect(() => __reloadCartFromStorageForTests()).not.toThrow();
    expect(getCartSnapshot().items).toHaveLength(0);
  });

  it("recovers from valid JSON with the wrong shape", () => {
    window.localStorage.setItem(CART_STORAGE_KEY, JSON.stringify({ foo: "bar" }));
    expect(() => __reloadCartFromStorageForTests()).not.toThrow();
    expect(getCartSnapshot().items).toHaveLength(0);
  });

  it("recovers from an old/unknown schema version", () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 999, items: [] }),
    );
    expect(() => __reloadCartFromStorageForTests()).not.toThrow();
    expect(getCartSnapshot().items).toHaveLength(0);
  });

  it("resets a pre-customization (v1) cart rather than crashing", () => {
    window.localStorage.setItem(
      CART_STORAGE_KEY,
      JSON.stringify({ version: 1, items: [{ ...ITEM_A, quantity: 2 }] }),
    );
    expect(() => __reloadCartFromStorageForTests()).not.toThrow();
    expect(getCartSnapshot().items).toHaveLength(0);
  });

  it("still works normally after recovering from bad data", () => {
    window.localStorage.setItem(CART_STORAGE_KEY, "garbage");
    __reloadCartFromStorageForTests();
    addToCart(ITEM_A, [CUSTOM_1]);
    expect(getCartSnapshot().items).toHaveLength(1);
  });
});
