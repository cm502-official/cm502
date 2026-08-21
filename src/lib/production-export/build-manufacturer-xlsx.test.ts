import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { buildManufacturerXlsxBuffer } from "./build-manufacturer-xlsx";
import type { ManufacturerRow } from "./build-manufacturer-rows";

async function readBack(buffer: Buffer) {
  const workbook = new ExcelJS.Workbook();
  // See the comment in build-manufacturer-xlsx.ts — exceljs's bundled
  // Buffer type predates @types/node's generic Buffer<TArrayBuffer>.
  await workbook.xlsx.load(buffer as unknown as never);
  const sheet = workbook.getWorksheet("Production");
  if (!sheet) throw new Error("Production worksheet missing");
  return { workbook, sheet };
}

const ROWS: ManufacturerRow[] = [
  { sequence: 1, color: "black", size: "8XL", name: "Nachanok", number: "22", recipient: "Nachanok Example", phone: "0812345678", address: "123/45 ถ.สุเทพ\nต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200" },
  { sequence: 2, color: "black", size: "2XL", name: "KORKOR", number: "10", recipient: "", phone: "", address: "" },
  { sequence: 3, color: "pink", size: "L", name: "SOMCHAI", number: "018", recipient: "Somchai Example", phone: "0899999999", address: "88/8\nเขตวัฒนา กรุงเทพฯ 10110" },
];

describe("buildManufacturerXlsxBuffer", () => {
  it("writes a 'Production' worksheet with the exact §4 header row", async () => {
    const buffer = await buildManufacturerXlsxBuffer(ROWS);
    const { sheet } = await readBack(buffer);
    const header = sheet.getRow(1).values as unknown[];
    // exceljs row.values is 1-indexed (index 0 is empty)
    expect(header.slice(1)).toEqual(["#", "Color", "Size", "Name", "Number", "Recipient", "Phone", "Address"]);
    expect(sheet.getRow(1).font?.bold).toBe(true);
  });

  it("writes one row per shirt, address only on each order's first row", async () => {
    const buffer = await buildManufacturerXlsxBuffer(ROWS);
    const { sheet } = await readBack(buffer);
    expect(sheet.rowCount).toBe(4); // header + 3 shirts
    // Column keys are an in-memory exceljs convenience and don't survive
    // a real xlsx round-trip, so the read-back assertions address columns
    // by letter (A=#, B=Color, C=Size, D=Name, E=Number, F=Recipient,
    // G=Phone, H=Address — matching MANUFACTURER_COLUMN_HEADERS order).
    expect(sheet.getRow(2).getCell("H").value).toBe("123/45 ถ.สุเทพ\nต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200");
    expect(sheet.getRow(3).getCell("H").value).toBe("");
    expect(sheet.getRow(4).getCell("H").value).toBe("88/8\nเขตวัฒนา กรุงเทพฯ 10110");
  });

  it("preserves leading zeros in Number/Phone as text", async () => {
    const buffer = await buildManufacturerXlsxBuffer(ROWS);
    const { sheet } = await readBack(buffer);
    // row 4 = shirt #3, number "018"; column E = Number, G = Phone
    expect(sheet.getRow(4).getCell("E").value).toBe("018");
    expect(typeof sheet.getRow(4).getCell("E").value).toBe("string");
    expect(sheet.getColumn("E").numFmt).toBe("@");
    expect(sheet.getColumn("G").numFmt).toBe("@");
  });

  it("freezes the header row and defines an autofilter", async () => {
    const buffer = await buildManufacturerXlsxBuffer(ROWS);
    const { sheet } = await readBack(buffer);
    expect(sheet.views?.[0]?.state).toBe("frozen");
    expect((sheet.views?.[0] as ExcelJS.WorksheetViewFrozen | undefined)?.ySplit).toBe(1);
    expect(sheet.autoFilter).toBeTruthy();
  });

  it("marks a top border on the first row of each order, not on continuation rows", async () => {
    const buffer = await buildManufacturerXlsxBuffer(ROWS);
    const { sheet } = await readBack(buffer);
    expect(sheet.getRow(2).getCell("A").border?.top).toBeTruthy();
    expect(sheet.getRow(3).getCell("A").border?.top).toBeFalsy();
    expect(sheet.getRow(4).getCell("A").border?.top).toBeTruthy();
  });

  it("enables wrap text and top vertical alignment on the Address column", async () => {
    const buffer = await buildManufacturerXlsxBuffer(ROWS);
    const { sheet } = await readBack(buffer);
    expect(sheet.getRow(2).getCell("H").alignment?.wrapText).toBe(true);
    expect(sheet.getRow(2).getCell("H").alignment?.vertical).toBe("top");
    expect(sheet.getRow(4).getCell("H").alignment?.wrapText).toBe(true);
  });

  it("gives rows with a two-line address a taller height than rows without an address", async () => {
    const buffer = await buildManufacturerXlsxBuffer(ROWS);
    const { sheet } = await readBack(buffer);
    const addressRowHeight = sheet.getRow(2).height; // two-line address
    const blankAddressRowHeight = sheet.getRow(3).height; // continuation row, no address
    expect(addressRowHeight).toBeGreaterThan(15); // taller than Excel's ~15pt single-line default
    expect(blankAddressRowHeight ?? 0).toBeLessThan(addressRowHeight ?? 0);
    // The other order's first row also gets the taller height.
    expect(sheet.getRow(4).height).toBe(addressRowHeight);
  });

  it("keeps the Address column widest and the whole sheet reasonably narrow", async () => {
    const buffer = await buildManufacturerXlsxBuffer(ROWS);
    const { sheet } = await readBack(buffer);
    const widths = ["A", "B", "C", "D", "E", "F", "G", "H"].map((c) => sheet.getColumn(c).width ?? 0);
    const addressWidth = widths[7];
    expect(addressWidth).toBe(Math.max(...widths));
    // Sanity bound — no single column so wide the sheet becomes unusable.
    expect(addressWidth).toBeLessThanOrEqual(80);
  });
});
