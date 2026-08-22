import "server-only";

import ExcelJS from "exceljs";
import type { ReportExportSection } from "./build-report-export-rows";

/** §14 — one worksheet, sections stacked top-to-bottom with a bold title row + bold header row each, one blank row between sections. */
export async function buildReportExportXlsxBuffer(sections: ReportExportSection[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CM502";
  workbook.created = new Date();

  const sheet = workbook.addWorksheet("Report");

  let rowCursor = 1;
  let maxColumns = 1;

  for (const section of sections) {
    const titleRow = sheet.getRow(rowCursor);
    titleRow.getCell(1).value = section.title;
    titleRow.getCell(1).font = { bold: true, size: 13 };
    rowCursor += 1;

    const headerRow = sheet.getRow(rowCursor);
    section.headers.forEach((header, i) => {
      const cell = headerRow.getCell(i + 1);
      cell.value = header;
      cell.font = { bold: true };
    });
    maxColumns = Math.max(maxColumns, section.headers.length);
    rowCursor += 1;

    for (const row of section.rows) {
      const dataRow = sheet.getRow(rowCursor);
      row.forEach((value, i) => {
        dataRow.getCell(i + 1).value = value;
      });
      maxColumns = Math.max(maxColumns, row.length);
      rowCursor += 1;
    }

    rowCursor += 1; // blank separator row between sections
  }

  for (let i = 1; i <= maxColumns; i++) {
    sheet.getColumn(i).width = 20;
  }

  // See build-manufacturer-xlsx.ts for why this cast is needed — exceljs's
  // bundled types predate @types/node's generic Buffer<TArrayBuffer>.
  const buffer = await workbook.xlsx.writeBuffer();
  return buffer as unknown as Buffer;
}
