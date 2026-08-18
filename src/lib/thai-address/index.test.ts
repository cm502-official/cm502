import { describe, expect, it } from "vitest";
import {
  findDistrictById,
  findProvinceById,
  findSubdistrictById,
  getDistrictsByProvince,
  getProvinces,
  getSubdistrictsByDistrict,
  resolveThaiAddressHierarchy,
} from "./index";

// เชียงใหม่(38) → เมืองเชียงใหม่(5001) → สุเทพ(500108) → 50200 — the
// exact example from the task brief, used throughout as the known-good
// fixture.
const CHIANG_MAI_PROVINCE_ID = 38;
const MUEANG_CHIANG_MAI_DISTRICT_ID = 5001;
const SUTHEP_SUBDISTRICT_ID = 500108;
const SUTHEP_ZIP = "50200";

describe("getProvinces", () => {
  it("returns all 77 Thai provinces", () => {
    expect(getProvinces().length).toBe(77);
  });

  it("includes Bangkok and Chiang Mai", () => {
    const names = getProvinces().map((p) => p.nameTh);
    expect(names).toContain("กรุงเทพมหานคร");
    expect(names).toContain("เชียงใหม่");
  });
});

describe("getDistrictsByProvince", () => {
  it("returns only districts belonging to the given province", () => {
    const districts = getDistrictsByProvince(CHIANG_MAI_PROVINCE_ID);
    expect(districts.length).toBeGreaterThan(0);
    expect(districts.every((d) => d.provinceId === CHIANG_MAI_PROVINCE_ID)).toBe(true);
    expect(districts.map((d) => d.nameTh)).toContain("เมืองเชียงใหม่");
  });

  it("returns an empty list for an unknown/missing province id", () => {
    expect(getDistrictsByProvince(999999)).toEqual([]);
    expect(getDistrictsByProvince(null)).toEqual([]);
    expect(getDistrictsByProvince(undefined)).toEqual([]);
  });

  it("never mixes districts from a different province (stale-selection guard)", () => {
    const chiangMaiDistricts = getDistrictsByProvince(CHIANG_MAI_PROVINCE_ID);
    const bangkokDistricts = getDistrictsByProvince(1);
    const overlap = chiangMaiDistricts.filter((d) => bangkokDistricts.some((b) => b.id === d.id));
    expect(overlap).toEqual([]);
  });
});

describe("getSubdistrictsByDistrict", () => {
  it("returns only subdistricts belonging to the given district", () => {
    const subdistricts = getSubdistrictsByDistrict(MUEANG_CHIANG_MAI_DISTRICT_ID);
    expect(subdistricts.length).toBeGreaterThan(0);
    expect(subdistricts.every((s) => s.districtId === MUEANG_CHIANG_MAI_DISTRICT_ID)).toBe(true);
    expect(subdistricts.map((s) => s.nameTh)).toContain("สุเทพ");
  });

  it("returns an empty list for an unknown/missing district id", () => {
    expect(getSubdistrictsByDistrict(999999)).toEqual([]);
    expect(getSubdistrictsByDistrict(null)).toEqual([]);
  });

  it("each subdistrict carries a valid 5-digit zip code", () => {
    for (const s of getSubdistrictsByDistrict(MUEANG_CHIANG_MAI_DISTRICT_ID)) {
      expect(s.zipCode).toMatch(/^\d{5}$/);
    }
  });
});

describe("findProvinceById / findDistrictById / findSubdistrictById", () => {
  it("resolves the exact task-brief example", () => {
    expect(findProvinceById(CHIANG_MAI_PROVINCE_ID)?.nameTh).toBe("เชียงใหม่");
    expect(findDistrictById(MUEANG_CHIANG_MAI_DISTRICT_ID)?.nameTh).toBe("เมืองเชียงใหม่");
    const subdistrict = findSubdistrictById(SUTHEP_SUBDISTRICT_ID);
    expect(subdistrict?.nameTh).toBe("สุเทพ");
    expect(subdistrict?.zipCode).toBe(SUTHEP_ZIP);
  });

  it("returns undefined for unknown ids", () => {
    expect(findProvinceById(999999)).toBeUndefined();
    expect(findDistrictById(999999)).toBeUndefined();
    expect(findSubdistrictById(999999)).toBeUndefined();
  });
});

describe("resolveThaiAddressHierarchy", () => {
  it("resolves a legitimate Province → District → Subdistrict chain", () => {
    const result = resolveThaiAddressHierarchy({
      provinceId: CHIANG_MAI_PROVINCE_ID,
      districtId: MUEANG_CHIANG_MAI_DISTRICT_ID,
      subdistrictId: SUTHEP_SUBDISTRICT_ID,
    });
    expect(result).toEqual({
      province: "เชียงใหม่",
      district: "เมืองเชียงใหม่",
      subdistrict: "สุเทพ",
      postalCode: SUTHEP_ZIP,
    });
  });

  it("auto-derives the correct postal code regardless of what's passed", () => {
    const result = resolveThaiAddressHierarchy({
      provinceId: CHIANG_MAI_PROVINCE_ID,
      districtId: MUEANG_CHIANG_MAI_DISTRICT_ID,
      subdistrictId: SUTHEP_SUBDISTRICT_ID,
      postalCode: SUTHEP_ZIP,
    });
    expect(result?.postalCode).toBe(SUTHEP_ZIP);
  });

  it("rejects a subdistrict that doesn't belong to the claimed district", () => {
    // Suthep (5001's child) claimed under a different, unrelated district id.
    const otherDistrict = getDistrictsByProvince(1)[0]!.id; // a Bangkok district
    const result = resolveThaiAddressHierarchy({
      provinceId: CHIANG_MAI_PROVINCE_ID,
      districtId: otherDistrict,
      subdistrictId: SUTHEP_SUBDISTRICT_ID,
    });
    expect(result).toBeNull();
  });

  it("rejects a district that doesn't belong to the claimed province", () => {
    const bangkokDistrict = getDistrictsByProvince(1)[0]!.id;
    const result = resolveThaiAddressHierarchy({
      provinceId: CHIANG_MAI_PROVINCE_ID,
      districtId: bangkokDistrict,
      subdistrictId: SUTHEP_SUBDISTRICT_ID,
    });
    expect(result).toBeNull();
  });

  it("rejects a postal code that doesn't match the resolved subdistrict", () => {
    const result = resolveThaiAddressHierarchy({
      provinceId: CHIANG_MAI_PROVINCE_ID,
      districtId: MUEANG_CHIANG_MAI_DISTRICT_ID,
      subdistrictId: SUTHEP_SUBDISTRICT_ID,
      postalCode: "10110",
    });
    expect(result).toBeNull();
  });

  it("rejects unknown ids entirely", () => {
    expect(
      resolveThaiAddressHierarchy({ provinceId: 999999, districtId: 999999, subdistrictId: 999999 }),
    ).toBeNull();
  });
});
