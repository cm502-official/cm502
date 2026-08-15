import { describe, expect, it } from "vitest";
import {
  addressSchema,
  cartLineSchema,
  createOrderRequestSchema,
  customerSchema,
  emailSchema,
  phoneSchema,
  postalCodeSchema,
} from "./checkout";

describe("phoneSchema", () => {
  it("accepts common Thai mobile formats", () => {
    expect(phoneSchema.parse("0812345678")).toBe("0812345678");
    expect(phoneSchema.parse("081-234-5678")).toBe("0812345678");
    expect(phoneSchema.parse("081 234 5678")).toBe("0812345678");
    expect(phoneSchema.parse("+66812345678")).toBe("+66812345678");
    expect(phoneSchema.parse("66812345678")).toBe("66812345678");
  });

  it("rejects too-short or malformed numbers", () => {
    expect(phoneSchema.safeParse("123").success).toBe(false);
    expect(phoneSchema.safeParse("not a phone").success).toBe(false);
    expect(phoneSchema.safeParse("").success).toBe(false);
  });
});

describe("emailSchema", () => {
  it("is optional", () => {
    expect(emailSchema.parse("")).toBeUndefined();
    expect(emailSchema.parse(undefined)).toBeUndefined();
  });

  it("validates a supplied email", () => {
    expect(emailSchema.parse("a@example.com")).toBe("a@example.com");
  });

  it("rejects an invalid supplied email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("postalCodeSchema", () => {
  it("accepts exactly 5 digits", () => {
    expect(postalCodeSchema.parse("10110")).toBe("10110");
  });

  it("rejects wrong length or non-digits", () => {
    expect(postalCodeSchema.safeParse("1011").success).toBe(false);
    expect(postalCodeSchema.safeParse("101100").success).toBe(false);
    expect(postalCodeSchema.safeParse("abcde").success).toBe(false);
  });
});

describe("addressSchema", () => {
  it("rejects blank-after-trim required fields", () => {
    const result = addressSchema.safeParse({
      addressLine: "   ",
      subdistrict: "Lumphini",
      district: "Pathum Wan",
      province: "Bangkok",
      postalCode: "10330",
    });
    expect(result.success).toBe(false);
  });
});

describe("cartLineSchema", () => {
  it("rejects zero/negative/oversized quantity", () => {
    const base = { variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6" };
    expect(cartLineSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...base, quantity: -1 }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...base, quantity: 1.5 }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...base, quantity: 999 }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...base, quantity: 1 }).success).toBe(true);
  });
});

describe("createOrderRequestSchema — full valid Thai checkout", () => {
  const validPayload = {
    idempotencyKey: "abc123",
    items: [{ variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", quantity: 2 }],
    customer: {
      fullName: "Somchai Jaidee",
      phone: "081-234-5678",
      lineId: "somchai_j",
      email: "somchai@example.com",
    },
    address: {
      addressLine: "123/45 Sukhumvit Rd.",
      subdistrict: "Khlong Toei",
      district: "Khlong Toei",
      province: "Bangkok",
      postalCode: "10110",
    },
    shippingMethodId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
  };

  it("accepts a valid full payload", () => {
    expect(createOrderRequestSchema.safeParse(validPayload).success).toBe(true);
  });

  it("accepts optional fields omitted", () => {
    const { customer, ...rest } = validPayload;
    const payload = { ...rest, customer: { fullName: customer.fullName, phone: customer.phone } };
    expect(createOrderRequestSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects an empty cart", () => {
    expect(
      createOrderRequestSchema.safeParse({ ...validPayload, items: [] }).success,
    ).toBe(false);
  });

  it("rejects missing required address fields", () => {
    const payload = {
      ...validPayload,
      address: { ...validPayload.address, district: "" },
    };
    expect(createOrderRequestSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid postal code", () => {
    const payload = {
      ...validPayload,
      address: { ...validPayload.address, postalCode: "123" },
    };
    expect(createOrderRequestSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects an invalid email when supplied", () => {
    const payload = {
      ...validPayload,
      customer: { ...validPayload.customer, email: "not-an-email" },
    };
    expect(createOrderRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe("customerSchema / addressSchema exports stay in sync with the full schema", () => {
  it("parse independently the same way", () => {
    expect(
      customerSchema.safeParse({ fullName: "A", phone: "0812345678" }).success,
    ).toBe(true);
    expect(
      addressSchema.safeParse({
        addressLine: "1",
        subdistrict: "1",
        district: "1",
        province: "1",
        postalCode: "10110",
      }).success,
    ).toBe(true);
  });
});
