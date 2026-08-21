import { describe, expect, it } from "vitest";
import { formatManufacturerAddress } from "./build-manufacturer-address";

describe("formatManufacturerAddress", () => {
  it("builds the exact §5 example format for a non-Bangkok province", () => {
    const address = formatManufacturerAddress({
      addressLine: "123/45 หมู่ 3",
      soiRoad: "ถ.สุเทพ",
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postalCode: "50200",
      deliveryNote: null,
    });
    expect(address).toBe("123/45 หมู่ 3 ถ.สุเทพ ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200");
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
    expect(address).toBe("88/8 ต.คลองเตยเหนือ เขตวัฒนา กรุงเทพฯ 10110");
  });

  it("omits soi/road entirely when not present, with no double space", () => {
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
    expect(address).toBe("1 ถนนสุขุมวิท ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200");
  });

  it("appends the delivery note when present", () => {
    const address = formatManufacturerAddress({
      addressLine: "1 ถนนสุขุมวิท",
      soiRoad: null,
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postalCode: "50200",
      deliveryNote: "โทรก่อนจัดส่ง",
    });
    expect(address).toBe("1 ถนนสุขุมวิท ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200 | หมายเหตุ: โทรก่อนจัดส่ง");
  });

  it("never emits the literal strings null or undefined, and never leaves a blank separator", () => {
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
    expect(address.startsWith(" ")).toBe(false);
    expect(address.endsWith(" ")).toBe(false);
  });
});
