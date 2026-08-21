import { describe, expect, it } from "vitest";
import { formatManufacturerAddress } from "./build-manufacturer-address";

describe("formatManufacturerAddress — two-line format", () => {
  it("splits into exactly two lines: house/building/soi/road, then subdistrict/district/province/postcode", () => {
    const address = formatManufacturerAddress({
      addressLine: "123/45 หมู่บ้าน ABC ซอย 5",
      soiRoad: "ถนนสุเทพ",
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postalCode: "50200",
      deliveryNote: null,
    });
    const lines = address.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[0]).toBe("123/45 หมู่บ้าน ABC ซอย 5 ถนนสุเทพ");
    expect(lines[1]).toBe("ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200");
  });

  it("contains exactly one newline character between the two lines", () => {
    const address = formatManufacturerAddress({
      addressLine: "123/45",
      soiRoad: null,
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postalCode: "50200",
      deliveryNote: null,
    });
    expect((address.match(/\n/g) ?? []).length).toBe(1);
  });

  it("uses กรุงเทพฯ (no จ. prefix) for Bangkok and doesn't double-prefix an already-เขต district", () => {
    const address = formatManufacturerAddress({
      addressLine: "88/8",
      soiRoad: null,
      subdistrict: "คลองเตยเหนือ",
      district: "เขตวัฒนา",
      province: "กรุงเทพมหานคร",
      postalCode: "10110",
      deliveryNote: null,
    });
    expect(address).toBe("88/8\nต.คลองเตยเหนือ เขตวัฒนา กรุงเทพฯ 10110");
  });

  it("omits soi/road entirely when not present, with no double space or empty separator", () => {
    const address = formatManufacturerAddress({
      addressLine: "1 ถนนสุขุมวิท",
      soiRoad: null,
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postalCode: "50200",
      deliveryNote: null,
    });
    expect(address).not.toContain("  ");
    expect(address).toBe("1 ถนนสุขุมวิท\nต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200");
  });

  it("appends the delivery note to line 2, after '| หมายเหตุ:'", () => {
    const address = formatManufacturerAddress({
      addressLine: "1 ถนนสุขุมวิท",
      soiRoad: null,
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postalCode: "50200",
      deliveryNote: "โทรก่อนจัดส่ง",
    });
    const lines = address.split("\n");
    expect(lines).toHaveLength(2);
    expect(lines[1]).toBe("ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200 | หมายเหตุ: โทรก่อนจัดส่ง");
    expect(lines[1].endsWith("| หมายเหตุ: โทรก่อนจัดส่ง")).toBe(true);
  });

  it("never emits the literal strings null or undefined, and never leaves a blank separator or blank line", () => {
    const address = formatManufacturerAddress({
      addressLine: "1 ถนนสุขุมวิท",
      soiRoad: undefined,
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postalCode: "50200",
      deliveryNote: undefined,
    });
    expect(address).not.toMatch(/null|undefined/i);
    expect(address).not.toContain("  ");
    expect(address.split("\n").every((line) => line !== "")).toBe(true);
  });

  it("falls back to a single line when line 2's fields are entirely missing (no stray leading/trailing newline)", () => {
    const address = formatManufacturerAddress({
      addressLine: "123/45",
      soiRoad: null,
      subdistrict: "",
      district: "",
      province: "",
      postalCode: "",
      deliveryNote: null,
    });
    expect(address).toBe("123/45");
    expect(address.startsWith("\n")).toBe(false);
    expect(address.endsWith("\n")).toBe(false);
  });
});
