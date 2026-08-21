/**
 * Thai administrative address dataset (Province → District/Amphoe →
 * Subdistrict/Tambon → Postal code).
 *
 * Source: vendored, trimmed snapshot of the MIT-licensed
 * kongvut/thai-province-data project (data/raw/{provinces,districts,
 * sub_districts}.json — https://github.com/kongvut/thai-province-data,
 * © Kongvut Sangkla, MIT License). Only the fields the checkout form
 * needs are kept (id, Thai name, parent id, zip code) — no lat/long,
 * English names, or timestamps — to keep the client bundle small.
 *
 * Deliberately a static, local dataset (not a live API): the checkout
 * must keep working even if every external service is unreachable, and
 * dependent-dropdown filtering needs to happen instantly as the customer
 * picks, with zero network round-trips and zero API keys.
 *
 * Update procedure: re-run the same trim against a fresh export from the
 * upstream repo if Thai administrative boundaries change; nothing else
 * in this module needs to change (data shape is stable).
 */
import rawData from "./data.json";

export interface ThaiProvince {
  id: number;
  nameTh: string;
}

export interface ThaiDistrict {
  id: number;
  nameTh: string;
  provinceId: number;
}

export interface ThaiSubdistrict {
  id: number;
  nameTh: string;
  districtId: number;
  zipCode: string;
}

interface ThaiAddressData {
  provinces: ThaiProvince[];
  districts: ThaiDistrict[];
  subdistricts: ThaiSubdistrict[];
}

const data = rawData as ThaiAddressData;

const provincesById = new Map(data.provinces.map((p) => [p.id, p]));
const districtsById = new Map(data.districts.map((d) => [d.id, d]));
const subdistrictsById = new Map(data.subdistricts.map((s) => [s.id, s]));

const districtsByProvince = new Map<number, ThaiDistrict[]>();
for (const d of data.districts) {
  const list = districtsByProvince.get(d.provinceId) ?? [];
  list.push(d);
  districtsByProvince.set(d.provinceId, list);
}

const subdistrictsByDistrict = new Map<number, ThaiSubdistrict[]>();
for (const s of data.subdistricts) {
  const list = subdistrictsByDistrict.get(s.districtId) ?? [];
  list.push(s);
  subdistrictsByDistrict.set(s.districtId, list);
}

/** All 77 provinces, in dataset order (already sorted by id). */
export function getProvinces(): ThaiProvince[] {
  return data.provinces;
}

/** Districts/Amphoe/Khet belonging to one province — empty for an unknown id. */
export function getDistrictsByProvince(provinceId: number | null | undefined): ThaiDistrict[] {
  if (provinceId == null) return [];
  return districtsByProvince.get(provinceId) ?? [];
}

/** Subdistricts/Tambon/Khwaeng belonging to one district — empty for an unknown id. */
export function getSubdistrictsByDistrict(districtId: number | null | undefined): ThaiSubdistrict[] {
  if (districtId == null) return [];
  return subdistrictsByDistrict.get(districtId) ?? [];
}

export function findProvinceById(id: number | null | undefined): ThaiProvince | undefined {
  if (id == null) return undefined;
  return provincesById.get(id);
}

/**
 * Reverse lookups by canonical Thai name — used by the admin order-edit
 * form (§1) to pre-fill the same dependent selects checkout uses, from
 * an existing order's stored address (which persists names, not ids;
 * see addresses.province/district/subdistrict). Scoped to the parent id
 * so a repeated district/subdistrict name in a different province/
 * district (e.g. "เมือง...") is never resolved to the wrong parent.
 */
export function findProvinceByName(name: string): ThaiProvince | undefined {
  return data.provinces.find((p) => p.nameTh === name);
}

export function findDistrictByNameInProvince(name: string, provinceId: number): ThaiDistrict | undefined {
  return getDistrictsByProvince(provinceId).find((d) => d.nameTh === name);
}

export function findSubdistrictByNameInDistrict(name: string, districtId: number): ThaiSubdistrict | undefined {
  return getSubdistrictsByDistrict(districtId).find((s) => s.nameTh === name);
}

export function findDistrictById(id: number | null | undefined): ThaiDistrict | undefined {
  if (id == null) return undefined;
  return districtsById.get(id);
}

export function findSubdistrictById(id: number | null | undefined): ThaiSubdistrict | undefined {
  if (id == null) return undefined;
  return subdistrictsById.get(id);
}

export interface ResolvedThaiAddress {
  province: string;
  district: string;
  subdistrict: string;
  postalCode: string;
}

/**
 * The server-side trust boundary for the administrative hierarchy
 * (§ don't blindly trust four unrelated strings from the browser).
 * Given only the three selected ids, independently walks
 * subdistrict → district → province in this dataset and returns the
 * canonical Thai names + postal code — never the client-submitted
 * text — or `null` if the ids don't form a real, consistent chain
 * (e.g. a subdistrict id that doesn't belong to the claimed district).
 *
 * If a postal code was also submitted, it must match the subdistrict's
 * actual postal code or resolution fails too — a stale/mismatched
 * postcode from an earlier selection must never slip through.
 */
export function resolveThaiAddressHierarchy(input: {
  provinceId: number;
  districtId: number;
  subdistrictId: number;
  postalCode?: string;
}): ResolvedThaiAddress | null {
  const subdistrict = findSubdistrictById(input.subdistrictId);
  if (!subdistrict) return null;

  const district = findDistrictById(input.districtId);
  if (!district || district.id !== subdistrict.districtId) return null;

  const province = findProvinceById(input.provinceId);
  if (!province || province.id !== district.provinceId) return null;

  if (input.postalCode && input.postalCode !== subdistrict.zipCode) return null;

  return {
    province: province.nameTh,
    district: district.nameTh,
    subdistrict: subdistrict.nameTh,
    postalCode: subdistrict.zipCode,
  };
}
