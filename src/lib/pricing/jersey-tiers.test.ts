import { describe, expect, it } from "vitest";
import { calculateJerseySubtotalSatang, getJerseyPriceRangeSatang, getJerseyUnitPriceSatang } from "./jersey-tiers";

describe("getJerseyPriceRangeSatang", () => {
  it("returns the cheapest (50+) and most expensive (1-2) tier prices", () => {
    expect(getJerseyPriceRangeSatang()).toEqual({ minSatang: 28900, maxSatang: 41900 });
  });
});

describe("getJerseyUnitPriceSatang — tier boundaries", () => {
  const cases: Array<[number, number]> = [
    [1, 41900],
    [2, 41900],
    [3, 39900],
    [4, 39900],
    [5, 37900],
    [9, 37900],
    [10, 34900],
    [19, 34900],
    [20, 29900],
    [49, 29900],
    [50, 28900],
    [51, 28900],
    [100, 28900],
    [500, 28900],
  ];

  for (const [qty, expected] of cases) {
    it(`${qty} shirt(s) → ${expected} satang/unit`, () => {
      expect(getJerseyUnitPriceSatang(qty)).toBe(expected);
    });
  }

  it("treats 0 quantity as the entry-tier price (never 0 or negative)", () => {
    expect(getJerseyUnitPriceSatang(0)).toBe(41900);
  });

  it("clamps negative/NaN/non-finite input to a safe entry-tier price rather than throwing", () => {
    expect(getJerseyUnitPriceSatang(-5)).toBe(41900);
    expect(getJerseyUnitPriceSatang(Number.NaN)).toBe(41900);
    // Non-finite input (e.g. Infinity) is treated as invalid, not as "a
    // very large valid quantity" — falls back to the safe entry-tier
    // price rather than granting the deepest discount.
    expect(getJerseyUnitPriceSatang(Number.POSITIVE_INFINITY)).toBe(41900);
  });

  it("truncates fractional quantities rather than rounding up into a cheaper tier", () => {
    expect(getJerseyUnitPriceSatang(2.9)).toBe(41900); // truncates to 2, not 3
    expect(getJerseyUnitPriceSatang(9.9)).toBe(37900); // truncates to 9, not 10
  });
});

describe("calculateJerseySubtotalSatang — worked examples from the spec", () => {
  const cases: Array<[number, number]> = [
    [1, 41900],
    [2, 83800],
    [3, 119700],
    [5, 189500],
    [10, 349000],
    [20, 598000],
    [50, 1445000],
  ];

  for (const [qty, expected] of cases) {
    it(`${qty} shirts → ${expected} satang subtotal`, () => {
      expect(calculateJerseySubtotalSatang(qty)).toBe(expected);
    });
  }
});

describe("mixed-size orders price off the combined total, not per line", () => {
  it("S×2 + M×3 = 5 total → 379 THB/unit for every shirt", () => {
    const total = 2 + 3;
    expect(total).toBe(5);
    expect(getJerseyUnitPriceSatang(total)).toBe(37900);
    expect(calculateJerseySubtotalSatang(total)).toBe(37900 * 5);
  });

  it("XS×5 + M×5 + L×10 = 20 total → 299 THB/unit for every shirt", () => {
    const total = 5 + 5 + 10;
    expect(total).toBe(20);
    expect(getJerseyUnitPriceSatang(total)).toBe(29900);
    expect(calculateJerseySubtotalSatang(total)).toBe(29900 * 20);
  });
});
