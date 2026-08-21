/**
 * §5 — builds one clean, printable, TWO-LINE shipping address for the
 * manufacturer file's single `Address` column, from the same canonical
 * address fields already stored on `addresses` (address_line, soi_road,
 * subdistrict, district, province, postal_code, delivery_note). Line 1
 * is house/building/soi/road; line 2 is subdistrict/district/province/
 * postal code (+ delivery note). The two lines are joined by exactly one
 * "\n" — a real cell-internal newline, not two separate columns. Never
 * emits "null"/"undefined" or doubled/empty separators — every part is
 * trimmed and dropped if blank before joining, so a missing soi/road or
 * delivery note simply isn't there rather than leaving a gap, and a
 * wholly-missing line (rare, but possible with partial data) is dropped
 * rather than leaving a stray blank line.
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

/**
 * Two-line printable address, e.g.:
 * ```
 * 123/45 หมู่ 3 ถ.สุเทพ
 * ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200
 * ```
 * Line 1 (house/building/soi/road) and line 2 (subdistrict/district/
 * province/postal code, + delivery note) are joined by exactly one "\n"
 * when both are present. If one line ends up empty (missing data), the
 * result is just the other line — never a stray blank line or leading/
 * trailing newline.
 */
export function formatManufacturerAddress(address: ManufacturerAddressInput): string {
  const line1Parts: string[] = [];
  const addressLine = address.addressLine?.trim();
  if (addressLine) line1Parts.push(addressLine);
  const soiRoad = address.soiRoad?.trim();
  if (soiRoad) line1Parts.push(soiRoad);
  const line1 = line1Parts.filter(Boolean).join(" ");

  const line2Parts: string[] = [];
  const subdistrict = address.subdistrict?.trim();
  if (subdistrict) line2Parts.push(withPrefix(subdistrict, "ต.", SUBDISTRICT_PREFIXES));
  const district = address.district?.trim();
  if (district) line2Parts.push(withPrefix(district, "อ.", DISTRICT_PREFIXES));
  const province = address.province?.trim();
  const postalCode = address.postalCode?.trim();
  const provincePostal = [province ? formatProvince(province) : "", postalCode].filter(Boolean).join(" ");
  if (provincePostal) line2Parts.push(provincePostal);
  let line2 = line2Parts.filter(Boolean).join(" ");

  const deliveryNote = address.deliveryNote?.trim();
  if (deliveryNote && line2 !== "") line2 += ` | หมายเหตุ: ${deliveryNote}`;
  else if (deliveryNote) line2 = `| หมายเหตุ: ${deliveryNote}`;

  return [line1, line2].filter((line) => line !== "").join("\n");
}
