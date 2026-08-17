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
  updateCartItemQuantity,
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

beforeEach(() => {
  window.localStorage.clear();
  __resetCartForTests();
});

describe("addToCart", () => {
  it("adds a new item", () => {
    addToCart(ITEM_A, 1);
    expect(getCartSnapshot().items).toHaveLength(1);
    expect(getCartSnapshot().items[0].quantity).toBe(1);
  });

  it("merges quantity when the same variant is added again", () => {
    addToCart(ITEM_A, 1);
    addToCart(ITEM_A, 2);
    const items = getCartSnapshot().items;
    expect(items).toHaveLength(1);
    expect(items[0].quantity).toBe(3);
  });

  it("keeps different variants as separate lines", () => {
    addToCart(ITEM_A, 1);
    addToCart(ITEM_B, 1);
    expect(getCartSnapshot().items).toHaveLength(2);
  });

  it("clamps quantity to the per-line maximum", () => {
    addToCart(ITEM_A, 999);
    expect(getCartSnapshot().items[0].quantity).toBe(10);
  });

  it("persists to localStorage", () => {
    addToCart(ITEM_A, 1);
    const raw = window.localStorage.getItem(CART_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw!).items).toHaveLength(1);
  });
});

describe("updateCartItemQuantity", () => {
  it("increments and decrements", () => {
    addToCart(ITEM_A, 1);
    updateCartItemQuantity(ITEM_A.variantId, 5);
    expect(getCartSnapshot().items[0].quantity).toBe(5);
    updateCartItemQuantity(ITEM_A.variantId, 2);
    expect(getCartSnapshot().items[0].quantity).toBe(2);
  });

  it("removes the line when quantity drops to zero", () => {
    addToCart(ITEM_A, 1);
    updateCartItemQuantity(ITEM_A.variantId, 0);
    expect(getCartSnapshot().items).toHaveLength(0);
  });
});

describe("removeFromCart / clearCart", () => {
  it("removes a single line", () => {
    addToCart(ITEM_A, 1);
    addToCart(ITEM_B, 1);
    removeFromCart(ITEM_A.variantId);
    expect(getCartSnapshot().items).toHaveLength(1);
    expect(getCartSnapshot().items[0].variantId).toBe(ITEM_B.variantId);
  });

  it("empties the whole cart", () => {
    addToCart(ITEM_A, 1);
    addToCart(ITEM_B, 1);
    clearCart();
    expect(getCartSnapshot().items).toHaveLength(0);
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
    addToCart(navyItem, 1);
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
    addToCart(pinkItem, 1);
    addToCart(brownItem, 1);

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

  it("still works normally after recovering from bad data", () => {
    window.localStorage.setItem(CART_STORAGE_KEY, "garbage");
    __reloadCartFromStorageForTests();
    addToCart(ITEM_A, 1);
    expect(getCartSnapshot().items).toHaveLength(1);
  });
});
