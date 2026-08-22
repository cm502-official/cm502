import { NextResponse } from "next/server";
import { getAdminUserOrNull } from "@/lib/admin/require-admin";
import { getAdminReportData } from "@/lib/admin/get-admin-report-data";
import { parseReportDateRangeSearchParams } from "@/lib/admin/report-date-range";
import { buildReportExportSections, formatReportExportAsCsv } from "@/lib/admin/build-report-export-rows";
import { buildReportExportXlsxBuffer } from "@/lib/admin/build-report-export-xlsx";

/**
 * GET /api/admin/report/export (§14) — "Export Report", a summary of
 * the selected period's Paid-Orders numbers. This is intentionally a
 * SEPARATE route from the existing manufacturer/vendor production
 * export (bulk-production-export, [orderNumber]/production-export) —
 * neither that route nor its behavior is touched here.
 */
export async function GET(request: Request) {
  const admin = await getAdminUserOrNull();
  if (!admin) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "ไม่มีสิทธิ์ดำเนินการนี้" } }, { status: 401 });
  }

  const url = new URL(request.url);
  const searchParams = Object.fromEntries(url.searchParams.entries());

  let report;
  try {
    report = await getAdminReportData(parseReportDateRangeSearchParams(searchParams));
  } catch (error) {
    console.error("[admin/report/export] failed to build report:", error);
    return NextResponse.json({ error: { code: "REPORT_FAILED", message: "สร้างรายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง" } }, { status: 502 });
  }

  const sections = buildReportExportSections(report);
  const xlsxBuffer = await buildReportExportXlsxBuffer(sections);

  return NextResponse.json({
    range: report.range,
    csv: formatReportExportAsCsv(sections),
    xlsxBase64: xlsxBuffer.toString("base64"),
  });
}
