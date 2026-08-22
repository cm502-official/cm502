import { describe, expect, it } from "vitest";
import { buildReportExportSections, formatReportExportAsCsv } from "./build-report-export-rows";
import { buildAdminReport, type ReportOrderInput } from "./report-calculations";
import { resolveReportDateRange } from "./report-date-range";

const COLOR_ORDER = new Map([["Black", 1], ["Navy", 2]]);
const SIZE_ORDER = new Map([["M", 1], ["L", 2]]);

function makeReport() {
  const orders: ReportOrderInput[] = [
    {
      orderNumber: "CM502-A",
      customerName: "Somchai",
      verifiedAt: "2026-08-15T10:00:00Z",
      totalSatang: 41900,
      productionExportedAt: "2026-08-16T00:00:00Z",
      address: { addressLine: "1", subdistrict: "a", district: "b", province: "c", postalCode: "50200" },
      items: [{ colorName: "Black", sizeName: "M", quantity: 1, customizations: [{ name: "N", number: "1" }] }],
    },
  ];
  return buildAdminReport(orders, COLOR_ORDER, SIZE_ORDER, resolveReportDateRange({ preset: "all_time" }));
}

describe("buildReportExportSections", () => {
  it("includes exactly the §14 summary fields, using the order's own stored total (not a recomputed price)", () => {
    const sections = buildReportExportSections(makeReport());
    const summary = sections.find((s) => s.title === "Summary")!;
    expect(summary.headers).toEqual(["Metric", "Value"]);
    expect(summary.rows).toEqual([
      ["Date Range", "All Time"],
      ["Total Revenue", "฿419.00"],
      ["Paid Orders", 1],
      ["Shirts Sold", 1],
      ["Average Order Value", "฿419.00"],
    ]);
  });

  it("includes Sales by Color, Sales by Size, Color × Size Summary, and Production Summary sections", () => {
    const titles = buildReportExportSections(makeReport()).map((s) => s.title);
    expect(titles).toEqual(["Summary", "Sales by Color", "Sales by Size", "Color × Size Summary", "Production Summary"]);
  });

  it("Color × Size Summary carries a Total row and Total column", () => {
    const section = buildReportExportSections(makeReport()).find((s) => s.title === "Color × Size Summary")!;
    expect(section.headers).toEqual(["Color", "M", "Total"]);
    expect(section.rows).toEqual([
      ["Black", 1, 1],
      ["Total", 1, 1],
    ]);
  });
});

describe("formatReportExportAsCsv", () => {
  it("produces a title line + header line + data lines per section, blank-line separated", () => {
    const csv = formatReportExportAsCsv(buildReportExportSections(makeReport()));
    const lines = csv.split("\n");
    expect(lines[0]).toBe("Summary");
    expect(lines[1]).toBe("Metric,Value");
    expect(lines[2]).toBe("Date Range,All Time");
    expect(csv).toContain("Sales by Color");
    expect(csv).toContain("Production Summary");
  });
});
