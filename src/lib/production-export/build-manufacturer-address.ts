/**
 * §5 — builds one clean, printable shipping-address line for the
 * manufacturer file from the same canonical address fields already
 * stored on `addresses` (address_line, soi_road, subdistrict, district,
 * province, postal_code, delivery_note). Never emits "null"/"undefined"
 * or doubled/empty separators — every part is trimmed and dropped if
 * blank before joining, so a missing soi/road or delivery note simply
 * isn't there rather than leaving a gap.
 */

export interface ManufacturerAddressInput {
  addressLine: string;
  soiRoad?: string | null;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
  deliveryNote?: string | null;
}

// The vendored Thai address dataset (src/lib/thai-address) already bakes
// "เขต"/"แขวง" into Bangkok's district/subdistrict names but leaves
// every other province's names bare — so prefixing is conditional on
// what's already there, not on which province this is.
const SUBDISTRICT_PREFIXES = ["ตำบล", "แขวง"];
const DISTRICT_PREFIXES = ["อำเภอ", "เขต"];

function withPrefix(value: string, prefix: string, skipIfStartsWith: string[]): string {
  if (skipIfStartsWith.some((p) => value.startsWith(p))) return value;
  return `${prefix}${value}`;
}

function formatProvince(province: string): string {
  if (province.includes("กรุงเทพ")) return "กรุงเทพฯ";
  if (province.startsWith("จังหวัด")) return province;
  return `จ.${province}`;
}

/** One printable line, e.g. `123/45 หมู่ 3 ถ.สุเทพ ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200`. */
export function formatManufacturerAddress(address: ManufacturerAddressInput): string {
  const parts: string[] = [];

  const addressLine = address.addressLine?.trim();
  if (addressLine) parts.push(addressLine);

  const soiRoad = address.soiRoad?.trim();
  if (soiRoad) parts.push(soiRoad);

  const subdistrict = address.subdistrict?.trim();
  if (subdistrict) parts.push(withPrefix(subdistrict, "ต.", SUBDISTRICT_PREFIXES));

  const district = address.district?.trim();
  if (district) parts.push(withPrefix(district, "อ.", DISTRICT_PREFIXES));

  const province = address.province?.trim();
  const postalCode = address.postalCode?.trim();
  const provincePostal = [province ? formatProvince(province) : "", postalCode].filter(Boolean).join(" ");
  if (provincePostal) parts.push(provincePostal);

  let line = parts.filter(Boolean).join(" ");

  const deliveryNote = address.deliveryNote?.trim();
  if (deliveryNote) line += ` | หมายเหตุ: ${deliveryNote}`;

  return line;
}
