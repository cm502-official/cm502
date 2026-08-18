import { describe, expect, it } from "vitest";
import { PAID_SHIPPING_SATANG, getShippingFeeSatang, isShippingChoice } from "./shipping-choice";

describe("getShippingFeeSatang", () => {
  it("free_social_proof mode is 0 satang", () => {
    expect(getShippingFeeSatang("free_social_proof")).toBe(0);
  });

  it("paid_shipping mode is exactly 6000 satang (฿60.00)", () => {
    expect(getShippingFeeSatang("paid_shipping")).toBe(6000);
    expect(PAID_SHIPPING_SATANG).toBe(6000);
  });
});

describe("isShippingChoice", () => {
  it("accepts the two valid enum values", () => {
    expect(isShippingChoice("free_social_proof")).toBe(true);
    expect(isShippingChoice("paid_shipping")).toBe(true);
  });

  it("rejects anything else, including an attempted client-supplied price string", () => {
    expect(isShippingChoice("free")).toBe(false);
    expect(isShippingChoice("0")).toBe(false);
    expect(isShippingChoice("")).toBe(false);
  });
});
