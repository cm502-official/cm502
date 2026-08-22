/**
 * §14 — pure formatter that turns an already-computed AdminReportData
 * into flat, generic "sections" (title + headers + rows), consumed
 * identically by the XLSX builder and the CSV fallback. This is the
 * Report Export — separate from the existing manufacturer/vendor
 * production export (build-manufacturer-rows.ts) and never touches it.
 */
import { formatSatangAsThb } from "@/lib/money";
import { csvEscape } from "@/lib/production-export/build-export-rows";
import type { AdminReportData } from "./report-calculations";

export interface ReportExportSection {
  title: string;
  headers: string[];
  rows: Array<Array<string | number>>;
}

export function buildReportExportSections(report: AdminReportData): ReportExportSection[] {
  const summary: ReportExportSection = {
    title: "Summary",
    headers: ["Metric", "Value"],
    rows: [
      ["Date Range", report.range.label],
      ["Total Revenue", formatSatangAsThb(report.overview.totalRevenueSatang)],
      ["Paid Orders", report.overview.paidOrders],
      ["Shirts Sold", report.overview.shirtsSold],
      ["Average Order Value", formatSatangAsThb(report.overview.averageOrderValueSatang)],
    ],
  };

  const salesByColor: ReportExportSection = {
    title: "Sales by Color",
    headers: ["Color", "Shirts", "Percent"],
    rows: report.salesByColor.map((r) => [r.name, r.shirts, `${r.percent}%`]),
  };

  const salesBySize: ReportExportSection = {
    title: "Sales by Size",
    headers: ["Size", "Shirts", "Percent"],
    rows: report.salesBySize.map((r) => [r.name, r.shirts, `${r.percent}%`]),
  };

  const { colorSizeMatrix } = report;
  const colorSize: ReportExportSection = {
    title: "Color × Size Summary",
    headers: ["Color", ...colorSizeMatrix.sizes, "Total"],
    rows: [
      ...colorSizeMatrix.colors.map((color) => [
        color,
        ...colorSizeMatrix.sizes.map((size) => colorSizeMatrix.cells[color]?.[size] ?? 0),
        colorSizeMatrix.rowTotals[color] ?? 0,
      ]),
      [
        "Total",
        ...colorSizeMatrix.sizes.map((size) => colorSizeMatrix.colTotals[size] ?? 0),
        colorSizeMatrix.grandTotal,
      ],
    ],
  };

  const production: ReportExportSection = {
    title: "Production Summary",
    headers: ["Metric", "Value"],
    rows: [
      ["Paid Shirts", report.production.summary.paidShirts],
      ["Sent to Production", report.production.summary.sentShirts],
      ["Not Sent to Production", report.production.summary.notSentShirts],
    ],
  };

  return [summary, salesByColor, salesBySize, colorSize, production];
}

/** CSV fallback — one blank line between sections, each section prefixed by its own title line. */
export function formatReportExportAsCsv(sections: ReportExportSection[]): string {
  const lines: string[] = [];
  for (const section of sections) {
    lines.push(csvEscape(section.title));
    lines.push(section.headers.map(csvEscape).join(","));
    for (const row of section.rows) {
      lines.push(row.map((v) => csvEscape(String(v))).join(","));
    }
    lines.push("");
  }
  return lines.join("\n").trimEnd();
}
