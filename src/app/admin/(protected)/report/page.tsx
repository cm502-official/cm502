import type { Metadata } from "next";
import { getAdminReportData } from "@/lib/admin/get-admin-report-data";
import { parseReportDateRangeSearchParams } from "@/lib/admin/report-date-range";
import { ReportDateFilter } from "@/components/admin/report/report-date-filter";
import { ReportOverviewCards } from "@/components/admin/report/report-overview-cards";
import { ReportSalesChart } from "@/components/admin/report/report-sales-chart";
import { ReportSalesByDimension } from "@/components/admin/report/report-sales-by-dimension";
import { ColorSizeTable } from "@/components/admin/report/color-size-table";
import { ReportProductionPanel } from "@/components/admin/report/report-production-panel";
import { ReportCustomizationQa } from "@/components/admin/report/report-customization-qa";
import { ReportCustomizationWarningBanner } from "@/components/admin/report/report-customization-warning-banner";
import { ReportNeedsAttention } from "@/components/admin/report/report-needs-attention";
import { ReportExportButton } from "@/components/admin/report/report-export-button";

export const metadata: Metadata = { title: "Report" };

/**
 * §1-§14 — sales/production report, Paid Orders only (orders.payment_status
 * = 'verified', the same field every other admin/production surface
 * already treats as "paid"). All computation is server-side
 * (get-admin-report-data.ts → report-calculations.ts) — this page only
 * renders the already-aggregated result; interactive bits (chart metric,
 * production filter, QA table paging) are client components that toggle
 * between precomputed data, never re-fetch.
 */
export default async function AdminReportPage({ searchParams }: PageProps<"/admin/report">) {
  const resolvedSearchParams = await searchParams;
  const rangeInput = parseReportDateRangeSearchParams(resolvedSearchParams);

  let report;
  let loadError: string | null = null;
  try {
    report = await getAdminReportData(rangeInput);
  } catch (error) {
    console.error("[admin/report] failed to load report:", error);
    loadError = "โหลดรายงานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  }

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl uppercase tracking-wide">Report</h1>
          <p className="mt-1 text-sm text-foreground/60">
            {report ? report.range.label : "Sales and production report — paid orders only."}
          </p>
        </div>
        {report && <ReportExportButton />}
      </div>

      <ReportDateFilter
        activePreset={rangeInput.preset}
        activeStartDate={rangeInput.startDate ?? null}
        activeEndDate={rangeInput.endDate ?? null}
      />

      {loadError ? (
        <div role="alert" className="border border-accent/40 bg-accent/5 p-4 text-sm text-accent">
          {loadError}
        </div>
      ) : !report ? null : report.overview.paidOrders === 0 ? (
        <div className="border border-line p-8 text-center text-sm text-foreground/60">
          No paid orders found for this period.
        </div>
      ) : (
        <>
          <ReportOverviewCards data={report.overview} />

          <ReportSalesChart buckets={report.salesOverTime.buckets} granularity={report.salesOverTime.granularity} />

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <ReportSalesByDimension title="Sales by Color" rows={report.salesByColor} />
            <ReportSalesByDimension title="Sales by Size" rows={report.salesBySize} />
          </div>

          <Section title="Color × Size Summary">
            <ColorSizeTable matrix={report.colorSizeMatrix} />
          </Section>

          <Section title="Production Summary">
            <ReportProductionPanel summary={report.production.summary} matrices={report.production.matrices} />
          </Section>

          <Section title="Customization QA">
            <div className="flex flex-col gap-3">
              <ReportCustomizationWarningBanner warnings={report.customizationWarnings} />
              <ReportCustomizationQa rows={report.customizationQa} />
            </div>
          </Section>

          <Section title="Needs Attention">
            <ReportNeedsAttention
              missingAddress={report.needsAttention.missingAddress}
              missingCustomization={report.needsAttention.missingCustomization}
              notSentToProduction={report.needsAttention.notSentToProduction}
            />
          </Section>
        </>
      )}

      {/* Even in the empty-period state, orders may still exist outside the
          window that need attention — but §12 is explicitly scoped to
          Paid Orders within the selected period, so it's intentionally
          omitted here rather than showing stale/out-of-range warnings. */}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">{title}</h2>
      {children}
    </div>
  );
}
