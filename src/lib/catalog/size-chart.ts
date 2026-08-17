/**
 * CM502 Jersey size chart — reference measurements only, not tied to
 * variant/inventory logic. Keyed by size name so the UI can look up a
 * row by the same `sizes.name` value the catalog already uses; sizes
 * that exist in the DB but aren't in this chart (shouldn't happen) just
 * render without a measurement row rather than crashing.
 *
 * Measurements are in inches, garment-flat (not body) measurements —
 * exactly the values supplied for this launch. Do not invent additional
 * measurements (e.g. sleeve length, shoulder width) beyond what's here.
 */
export interface SizeChartRow {
  size: string;
  chestInches: number;
  lengthInches: number;
}

export const JERSEY_SIZE_CHART: readonly SizeChartRow[] = [
  { size: "XS", chestInches: 34, lengthInches: 24.5 },
  { size: "S", chestInches: 36, lengthInches: 25.5 },
  { size: "M", chestInches: 38, lengthInches: 27 },
  { size: "L", chestInches: 40, lengthInches: 28 },
  { size: "XL", chestInches: 42, lengthInches: 29 },
  { size: "2XL", chestInches: 44, lengthInches: 30 },
  { size: "3XL", chestInches: 46, lengthInches: 31 },
  { size: "4XL", chestInches: 48, lengthInches: 32 },
  { size: "5XL", chestInches: 50, lengthInches: 33 },
  { size: "6XL", chestInches: 52, lengthInches: 33.5 },
  { size: "7XL", chestInches: 54, lengthInches: 34 },
  { size: "8XL", chestInches: 56, lengthInches: 34 },
  { size: "9XL", chestInches: 58, lengthInches: 34 },
  { size: "10XL", chestInches: 60, lengthInches: 34 },
];

/** Ordered list of every size name this product supports, for UI iteration. */
export const JERSEY_SIZE_ORDER: readonly string[] = JERSEY_SIZE_CHART.map((row) => row.size);
