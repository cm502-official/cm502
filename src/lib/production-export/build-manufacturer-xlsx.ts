import "server-only";

import ExcelJS from "exceljs";
import { MANUFACTURER_COLUMN_HEADERS, type ManufacturerRow } from "./build-manufacturer-rows";

/**
 * §13 — the manufacturer-facing XLSX. Same `rows` the preview table and
 * CSV fallback render (§10/§18), just laid out as a real spreadsheet:
 * bold frozen header, autofilter, sane column widths, Phone/Number
 * forced to text so leading zeros survive Excel's auto-numeric coercion
 * (a raw CSV opened in Excel loses them; an XLSX cell typed as text
 * does not), and a subtle top border marking where each new order's
 * shirts begin — the same signal the grouping itself already encodes
 * (`address !== ""`), never a second, separately-tracked boundary list.
 *
 * Address is a two-line value (formatManufacturerAddress joins house/
 * building/soi/road and subdistrict/district/province/postcode with a
 * real "\n") — the Address column gets wrap-text + top-vertical
 * alignment so both lines render inside the one cell, and any row whose
 * address contains a line break gets an explicit taller height (ExcelJS
 * has no auto-fit-row-height API, so this is set directly rather than
 * left to Excel to guess on open).
 */
const ADDRESS_ROW_HEIGHT = 30; // two lines + a little padding, vs. Excel's ~15pt single-line default
const ADDRESS_ALIGNMENT: Partial<ExcelJS.Alignment> = { wrapText: true, vertical: "top" };

export async function buildManufacturerXlsxBuffer(rows: ManufacturerRow[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CM502";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Production", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  // Address is deliberately the widest column (§ "goal is for the entire
  // address to be visible without requiring the manufacturer to manually
  // resize"); everything else stays compact/medium so the sheet as a
  // whole doesn't get excessively wide.
  sheet.columns = [
    { header: MANUFACTURER_COLUMN_HEADERS[0], key: "sequence", width: 6 },
    { header: MANUFACTURER_COLUMN_HEADERS[1], key: "color", width: 10 },
    { header: MANUFACTURER_COLUMN_HEADERS[2], key: "size", width: 8 },
    { header: MANUFACTURER_COLUMN_HEADERS[3], key: "name", width: 16 },
    { header: MANUFACTURER_COLUMN_HEADERS[4], key: "number", width: 10 },
    { header: MANUFACTURER_COLUMN_HEADERS[5], key: "recipient", width: 22 },
    { header: MANUFACTURER_COLUMN_HEADERS[6], key: "phone", width: 14 },
    { header: MANUFACTURER_COLUMN_HEADERS[7], key: "address", width: 48 },
  ];
  sheet.getColumn("address").alignment = ADDRESS_ALIGNMENT;

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true };
  headerRow.alignment = { vertical: "middle" };

  const ORDER_START_BORDER: Partial<ExcelJS.Border> = { style: "medium", color: { argb: "FFB3B3B3" } };

  for (const r of rows) {
    const row = sheet.addRow({
      sequence: r.sequence,
      color: r.color,
      size: r.size,
      name: r.name,
      number: r.number,
      recipient: r.recipient,
      phone: r.phone,
      address: r.address,
    });

    // §9 — a non-blank address on this row means it's the first shirt of
    // a new order (the same rule buildManufacturerRows itself used to
    // decide that), so a border here is enough to visually separate
    // orders without adding any "Order A" label rows.
    if (r.address !== "") {
      row.eachCell({ includeEmpty: true }, (cell) => {
        cell.border = { ...cell.border, top: ORDER_START_BORDER };
      });
    }

    // Only rows whose address actually wraps to two lines get the taller
    // height — a shirt row with no address (continuation of the same
    // order) stays at Excel's normal single-line height.
    row.getCell("address").alignment = ADDRESS_ALIGNMENT;
    if (r.address.includes("\n")) {
      row.height = ADDRESS_ROW_HEIGHT;
    }
  }

  // Phone/Number preserved as text (leading zeros) — values were already
  // added as JS strings above, so ExcelJS already typed the cells as
  // text; the '@' format just keeps Excel from re-guessing on open.
  sheet.getColumn("phone").numFmt = "@";
  sheet.getColumn("number").numFmt = "@";

  sheet.autoFilter = { from: "A1", to: "H1" };

  // exceljs's bundled types declare an internal `Buffer extends ArrayBuffer`
  // shim (predating @types/node's generic Buffer<TArrayBuffer>) that its
  // own writeBuffer() return type uses — at runtime this is a real Node
  // Buffer, the cast only reconciles the two conflicting type declarations.
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}
