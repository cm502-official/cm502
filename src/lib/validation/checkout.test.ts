import { describe, expect, it } from "vitest";
import {
  addressSchema,
  cartLineSchema,
  createOrderRequestSchema,
  customerSchema,
  emailSchema,
  phoneSchema,
  postalCodeSchema,
  shirtCustomizationSchema,
} from "./checkout";

const BLANK = { name: null, number: null };
function customizations(n: number) {
  return Array.from({ length: n }, () => ({ ...BLANK }));
}

// เชียงใหม่ → เมืองเชียงใหม่ → สุเทพ → 50200 — the exact task-brief example,
// used as the known-good Thai address fixture throughout.
const VALID_ADDRESS = {
  addressLine: "123/45",
  soiRoad: "ซอย 5",
  provinceId: 38,
  districtId: 5001,
  subdistrictId: 500108,
  postalCode: "50200",
};

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

  it("shows a Thai validation message", () => {
    const result = phoneSchema.safeParse("123");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง");
  });
});

describe("emailSchema", () => {
  it("is required", () => {
    expect(emailSchema.safeParse("").success).toBe(false);
    expect(emailSchema.safeParse(undefined).success).toBe(false);
  });

  it("validates a supplied email", () => {
    expect(emailSchema.parse("a@example.com")).toBe("a@example.com");
  });

  it("rejects an invalid supplied email with a Thai message", () => {
    const result = emailSchema.safeParse("not-an-email");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0]?.message).toBe("กรุณากรอกอีเมลให้ถูกต้อง");
  });
});

describe("postalCodeSchema", () => {
  it("accepts exactly 5 digits", () => {
    expect(postalCodeSchema.parse("10110")).toBe("10110");
  });

  it("rejects wrong length, non-digits, or too many digits", () => {
    expect(postalCodeSchema.safeParse("123").success).toBe(false);
    expect(postalCodeSchema.safeParse("1011").success).toBe(false);
    expect(postalCodeSchema.safeParse("101100").success).toBe(false);
    expect(postalCodeSchema.safeParse("abcde").success).toBe(false);
  });
});

describe("addressSchema", () => {
  it("accepts a complete, legitimate Thai address", () => {
    const result = addressSchema.safeParse(VALID_ADDRESS);
    expect(result.success).toBe(true);
  });

  it("accepts optional soi/road blank", () => {
    const rest: Partial<typeof VALID_ADDRESS> = { ...VALID_ADDRESS };
    delete rest.soiRoad;
    expect(addressSchema.safeParse(rest).success).toBe(true);
    expect(addressSchema.safeParse({ ...rest, soiRoad: "" }).success).toBe(true);
  });

  it("accepts optional delivery note blank", () => {
    expect(addressSchema.safeParse({ ...VALID_ADDRESS, deliveryNote: "" }).success).toBe(true);
    expect(addressSchema.safeParse(VALID_ADDRESS).success).toBe(true);
  });

  it("accepts a delivery note within the length limit", () => {
    const result = addressSchema.safeParse({ ...VALID_ADDRESS, deliveryNote: "ฝากไว้กับ รปภ." });
    expect(result.success).toBe(true);
  });

  it("rejects an oversized delivery note", () => {
    const result = addressSchema.safeParse({ ...VALID_ADDRESS, deliveryNote: "ก".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects blank-after-trim address line", () => {
    const result = addressSchema.safeParse({ ...VALID_ADDRESS, addressLine: "   " });
    expect(result.success).toBe(false);
  });

  it("rejects a missing province", () => {
    const result = addressSchema.safeParse({ ...VALID_ADDRESS, provinceId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing district", () => {
    const result = addressSchema.safeParse({ ...VALID_ADDRESS, districtId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects a missing subdistrict", () => {
    const result = addressSchema.safeParse({ ...VALID_ADDRESS, subdistrictId: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an invalid postcode", () => {
    expect(addressSchema.safeParse({ ...VALID_ADDRESS, postalCode: "123" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...VALID_ADDRESS, postalCode: "abcde" }).success).toBe(false);
    expect(addressSchema.safeParse({ ...VALID_ADDRESS, postalCode: "501000" }).success).toBe(false);
  });

  it("rejects a subdistrict that doesn't belong to the claimed district (stale selection)", () => {
    const result = addressSchema.safeParse({ ...VALID_ADDRESS, districtId: 1001 /* a Bangkok district */ });
    expect(result.success).toBe(false);
  });

  it("rejects a postal code that doesn't match the resolved subdistrict", () => {
    const result = addressSchema.safeParse({ ...VALID_ADDRESS, postalCode: "10110" });
    expect(result.success).toBe(false);
  });
});

describe("cartLineSchema", () => {
  const variantId = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

  it("rejects zero/negative/decimal quantity", () => {
    const base = { variantId, customizations: customizations(1) };
    expect(cartLineSchema.safeParse({ ...base, quantity: 0 }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...base, quantity: -1 }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...base, quantity: 1.5 }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...base, quantity: Number.NaN }).success).toBe(false);
    expect(cartLineSchema.safeParse({ ...base, quantity: 1 }).success).toBe(true);
  });

  it("accepts large bulk-preorder quantities — the jersey has no stock cap (§ unlimited preorder)", () => {
    expect(cartLineSchema.safeParse({ variantId, quantity: 999, customizations: customizations(999) }).success).toBe(
      true,
    );
    expect(cartLineSchema.safeParse({ variantId, quantity: 500, customizations: customizations(500) }).success).toBe(
      true,
    );
  });

  it("still rejects an unreasonable/malformed quantity beyond the anti-abuse ceiling", () => {
    expect(
      cartLineSchema.safeParse({ variantId, quantity: 100001, customizations: customizations(100001) }).success,
    ).toBe(false);
  });

  it("rejects when customizations.length doesn't match quantity (§22 count mismatch)", () => {
    expect(cartLineSchema.safeParse({ variantId, quantity: 3, customizations: customizations(2) }).success).toBe(
      false,
    );
    expect(cartLineSchema.safeParse({ variantId, quantity: 1, customizations: customizations(0) }).success).toBe(
      false,
    );
  });

  it("rejects an empty customizations array even when quantity is 0-ish invalid", () => {
    expect(cartLineSchema.safeParse({ variantId, quantity: 1, customizations: [] }).success).toBe(false);
  });
});

describe("shirtCustomizationSchema", () => {
  it("accepts null name/number (optional, §5)", () => {
    expect(shirtCustomizationSchema.safeParse({ name: null, number: null }).success).toBe(true);
  });

  it("accepts valid jersey numbers, including leading zero", () => {
    for (const n of ["0", "7", "07", "09", "10", "88", "99"]) {
      expect(shirtCustomizationSchema.safeParse({ name: null, number: n }).success).toBe(true);
    }
  });

  it("preserves a leading-zero number exactly as a string, not coerced", () => {
    const result = shirtCustomizationSchema.parse({ name: null, number: "07" });
    expect(result.number).toBe("07");
  });

  it("rejects invalid jersey numbers", () => {
    for (const n of ["100", "-1", "7.5", "ABC", "999"]) {
      expect(shirtCustomizationSchema.safeParse({ name: null, number: n }).success).toBe(false);
    }
  });

  it("accepts a name up to 15 characters", () => {
    expect(shirtCustomizationSchema.safeParse({ name: "A".repeat(15), number: null }).success).toBe(true);
  });

  it("rejects a name longer than 15 characters", () => {
    expect(shirtCustomizationSchema.safeParse({ name: "A".repeat(16), number: null }).success).toBe(false);
  });

  it("supports Thai text in the name field", () => {
    expect(shirtCustomizationSchema.safeParse({ name: "ลูซิเฟอร์", number: null }).success).toBe(true);
  });
});

describe("createOrderRequestSchema — full valid Thai checkout", () => {
  const validPayload = {
    idempotencyKey: "abc123",
    items: [
      {
        variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
        quantity: 2,
        customizations: [
          { name: "LUCIFER", number: "88" },
          { name: null, number: null },
        ],
      },
    ],
    customer: {
      fullName: "สมชาย ใจดี",
      phone: "081-234-5678",
      lineId: "somchai_j",
      email: "somchai@example.com",
    },
    address: VALID_ADDRESS,
    shippingMethodId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
    shippingChoice: "paid_shipping" as const,
  };

  it("accepts a valid full payload", () => {
    const result = createOrderRequestSchema.safeParse(validPayload);
    expect(result.success).toBe(true);
  });

  it("accepts optional lineId omitted (email stays required)", () => {
    const { customer, ...rest } = validPayload;
    const payload = { ...rest, customer: { fullName: customer.fullName, phone: customer.phone, email: customer.email } };
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
      address: { ...validPayload.address, districtId: "" },
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

  it("accepts free_social_proof as a valid shipping choice", () => {
    const payload = { ...validPayload, shippingChoice: "free_social_proof" };
    expect(createOrderRequestSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects a missing shipping choice", () => {
    const rest: Partial<typeof validPayload> = { ...validPayload };
    delete rest.shippingChoice;
    expect(createOrderRequestSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an attempted client-supplied numeric/free-form shipping choice", () => {
    expect(createOrderRequestSchema.safeParse({ ...validPayload, shippingChoice: "0" }).success).toBe(false);
    expect(createOrderRequestSchema.safeParse({ ...validPayload, shippingChoice: "free" }).success).toBe(false);
  });

  it("rejects a malformed administrative combination (hierarchy validation)", () => {
    const payload = {
      ...validPayload,
      address: { ...validPayload.address, provinceId: 1 /* Bangkok, doesn't own subdistrict 500108 */ },
    };
    expect(createOrderRequestSchema.safeParse(payload).success).toBe(false);
  });

  it("rejects a missing email (now required)", () => {
    const payload = {
      ...validPayload,
      customer: { ...validPayload.customer, email: "" },
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

  it("accepts a 30-shirt customized payload across multiple variant lines", () => {
    const payload = {
      ...validPayload,
      items: [
        {
          variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6",
          quantity: 20,
          customizations: customizations(20),
        },
        {
          variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa7",
          quantity: 10,
          customizations: customizations(10),
        },
      ],
    };
    expect(createOrderRequestSchema.safeParse(payload).success).toBe(true);
  });

  it("rejects a customization count mismatch anywhere in the item list", () => {
    const payload = {
      ...validPayload,
      items: [
        { variantId: "3fa85f64-5717-4562-b3fc-2c963f66afa6", quantity: 5, customizations: customizations(4) },
      ],
    };
    expect(createOrderRequestSchema.safeParse(payload).success).toBe(false);
  });
});

describe("customerSchema / addressSchema exports stay in sync with the full schema", () => {
  it("parse independently the same way", () => {
    expect(
      customerSchema.safeParse({ fullName: "A", phone: "0812345678", email: "a@example.com" }).success,
    ).toBe(true);
    expect(addressSchema.safeParse(VALID_ADDRESS).success).toBe(true);
  });
});
