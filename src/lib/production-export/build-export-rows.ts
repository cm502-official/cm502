/**
 * Canonical production-export row builder (§18) — the ONE place that
 * turns order_items + their per-shirt customizations into the flat,
 * normalized rows the shirt manufacturer receives. Used identically by
 * the admin preview table, the TXT/CSV download routes, and the tests —
 * so the preview the admin sees can never disagree with the downloaded
 * file (§16).
 *
 * One physical shirt = one row (§7): order_items.customizations already
 * carries exactly one entry per unit of quantity (§ shirt customization,
 * migration 0015's `customizations.length = quantity` constraint), so
 * expansion is just "iterate the array" — never re-deriving quantity
 * from a count that could drift.
 */

export interface ProductionExportItemInput {
  colorNameSnapshot: string;
  sizeNameSnapshot: string;
  quantity: number;
  /** One entry per physical shirt. Null on orders placed before personalization existed. */
  customizations: Array<{ name: string | null; number: string | null }> | null;
}

export interface ProductionRow {
  sequence: number;
  color: string;
  size: string;
  name: string;
  number: string;
}

export interface ProductionExportRowError {
  /** 1-based physical-shirt sequence this error refers to. */
  sequence: number;
  message: string;
}

export interface ProductionExportResult {
  rows: ProductionRow[];
  errors: ProductionExportRowError[];
}

/** No customization printed on this shirt (§9: optional, not mandatory — checked against shirtCustomizationSchema, which allows null). */
const EMPTY_PLACEHOLDER = "-";

// §17 — "/" is the field delimiter; a raw newline would split one row
// into two garbled lines. Both are supposed to be impossible by the time
// data reaches here (shirtCustomizationSchema already rejects them at
// entry, §17/checkout.ts), but export re-validates independently rather
// than trusting that no legacy/edited-around-the-schema row ever slipped
// through.
const FORBIDDEN_CHARS_REGEX = /[/\n\r]/;

function normalizeColor(colorName: string): string {
  return colorName.trim().toLowerCase();
}

function normalizeSize(sizeName: string): string {
  return sizeName.trim().toUpperCase();
}

function normalizeCustomizationField(value: string | null): string {
  if (value == null) return EMPTY_PLACEHOLDER;
  const trimmed = value.trim();
  return trimmed === "" ? EMPTY_PLACEHOLDER : trimmed;
}

/**
 * Builds normalized, sequenced production rows from an order's line
 * items. `startSequence` lets bulk export choose between restarting at 1
 * per order (grouped/header mode) or continuing across a whole batch
 * (headerless/raw mode) — see build-export-file.ts.
 */
export function buildProductionExportRows(
  items: ProductionExportItemInput[],
  startSequence = 1,
): ProductionExportResult {
  const rows: ProductionRow[] = [];
  const errors: ProductionExportRowError[] = [];
  let sequence = startSequence;

  for (const item of items) {
    const color = normalizeColor(item.colorNameSnapshot);
    const size = normalizeSize(item.sizeNameSnapshot);
    // customizations is null only for pre-personalization historical
    // orders — every physical unit still gets a row, just with no name/number.
    const perUnit = item.customizations ?? Array.from({ length: item.quantity }, () => ({ name: null, number: null }));

    for (const c of perUnit) {
      const name = normalizeCustomizationField(c.name);
      const number = normalizeCustomizationField(c.number);

      if (FORBIDDEN_CHARS_REGEX.test(name) || FORBIDDEN_CHARS_REGEX.test(number)) {
        errors.push({
          sequence,
          message: `เสื้อตัวที่ ${sequence} มีอักขระที่ไม่รองรับในหลักฐาน ("/" หรือขึ้นบรรทัดใหม่)`,
        });
      }

      rows.push({ sequence, color, size, name, number });
      sequence += 1;
    }
  }

  return { rows, errors };
}

/** One row formatted exactly as the manufacturer file requires: `SEQUENCE/COLOR/SIZE/NAME/NUMBER`. */
export function formatProductionRow(row: ProductionRow): string {
  return `${row.sequence}/${row.color}/${row.size}/${row.name}/${row.number}`;
}

/** Plain TXT body for one order's rows — no trailing newline, no header. */
export function formatProductionRowsAsTxt(rows: ProductionRow[]): string {
  return rows.map(formatProductionRow).join("\n");
}

/** CSV body (§10 "also add CSV if easy") — same normalized rows, comma-separated with a header line. */
export function formatProductionRowsAsCsv(rows: ProductionRow[]): string {
  const header = "sequence,color,size,name,number";
  const lines = rows.map((r) => `${r.sequence},${r.color},${r.size},${csvEscape(r.name)},${csvEscape(r.number)}`);
  return [header, ...lines].join("\n");
}

function csvEscape(value: string): string {
  if (value.includes(",") || value.includes('"')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}
