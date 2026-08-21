/**
 * Canonical manufacturer-export row builder. One order can hold many
 * physical shirts but (almost always) exactly one shipping address —
 * repeating that address on every shirt row is wrong and was the bug
 * this file fixes. The rule (mandatory):
 *
 *   - the FIRST physical-shirt row of an order carries Recipient/Phone/Address
 *   - every SUBSEQUENT row for that same order leaves those three blank
 *   - numbering (`#`) is continuous across the whole export, never
 *     restarting per order
 *
 * This is the ONE place that grouping logic lives — preview, CSV, and
 * XLSX all consume the same `rows` array from here, so none of them can
 * ever disagree about which row gets the address (mirrors the
 * single-source-of-truth pattern buildProductionExportRows already
 * established for shirt normalization, which this function is layered
 * on top of rather than re-implementing).
 */

import {
  buildProductionExportRows,
  csvEscape,
  type ProductionExportItemInput,
  type ProductionExportRowError,
} from "./build-export-rows";

export interface ManufacturerRow {
  sequence: number;
  color: string;
  size: string;
  name: string;
  number: string;
  /** Blank ("") on every row except the first physical shirt of its order. */
  recipient: string;
  phone: string;
  address: string;
}

export interface ManufacturerOrderInput {
  orderNumber: string;
  items: ProductionExportItemInput[];
  recipient: string;
  phone: string;
  /** Pre-formatted full address line — see formatManufacturerAddress. */
  address: string;
}

export interface ManufacturerOrderRowSummary {
  orderNumber: string;
  rowCount: number;
  errors: ProductionExportRowError[];
}

export interface ManufacturerExportResult {
  rows: ManufacturerRow[];
  errors: ProductionExportRowError[];
  perOrder: ManufacturerOrderRowSummary[];
}

/** Exact, ordered manufacturer-file column headers (§4) — nothing else. */
export const MANUFACTURER_COLUMN_HEADERS = [
  "#",
  "Color",
  "Size",
  "Name",
  "Number",
  "Recipient",
  "Phone",
  "Address",
] as const;

/**
 * Builds the flat, continuously-numbered row list for one or many
 * orders. Order boundaries are preserved and never interleaved — shirts
 * from the same order are always contiguous, in the exact sequence
 * `orders` was given (§8: callers should already have sorted/selected
 * orders the way they want them to appear before calling this).
 */
export function buildManufacturerRows(orders: ManufacturerOrderInput[]): ManufacturerExportResult {
  const rows: ManufacturerRow[] = [];
  const errors: ProductionExportRowError[] = [];
  const perOrder: ManufacturerOrderRowSummary[] = [];
  let sequence = 1;

  for (const order of orders) {
    const { rows: orderRows, errors: orderErrors } = buildProductionExportRows(order.items, sequence);
    errors.push(...orderErrors);
    perOrder.push({ orderNumber: order.orderNumber, rowCount: orderRows.length, errors: orderErrors });

    orderRows.forEach((r, index) => {
      rows.push({
        sequence: r.sequence,
        color: r.color,
        size: r.size,
        name: r.name,
        number: r.number,
        recipient: index === 0 ? order.recipient : "",
        phone: index === 0 ? order.phone : "",
        address: index === 0 ? order.address : "",
      });
    });

    sequence += orderRows.length;
  }

  return { rows, errors, perOrder };
}

/** Orders that had at least one row-level error (corrupt customization) — callers should block the download and surface these, same contract as the old per-shirt exporter. */
export function collectManufacturerExportErrors(
  perOrder: ManufacturerOrderRowSummary[],
): Array<{ orderNumber: string; errors: ProductionExportRowError[] }> {
  return perOrder.filter((o) => o.errors.length > 0).map((o) => ({ orderNumber: o.orderNumber, errors: o.errors }));
}

/** CSV fallback — same normalized rows, exact §4 headers, comma-separated. */
export function formatManufacturerRowsAsCsv(rows: ManufacturerRow[]): string {
  const lines = rows.map((r) =>
    [
      String(r.sequence),
      r.color,
      r.size,
      r.name,
      r.number,
      r.recipient,
      r.phone,
      r.address,
    ]
      .map(csvEscape)
      .join(","),
  );
  return [MANUFACTURER_COLUMN_HEADERS.join(","), ...lines].join("\n");
}
