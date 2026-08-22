import { formatSatangAsThb } from "@/lib/money";
import type { ReportOverviewCards as OverviewCardsData } from "@/lib/admin/report-calculations";

/** §3 — the 4 summary cards, all computed from Paid Orders only. */
export function ReportOverviewCards({ data }: { data: OverviewCardsData }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <Card label="Total Revenue" value={formatSatangAsThb(data.totalRevenueSatang)} />
      <Card label="Paid Orders" value={`${data.paidOrders.toLocaleString("en-US")} Orders`} />
      <Card label="Shirts Sold" value={`${data.shirtsSold.toLocaleString("en-US")} Shirts`} />
      <Card label="Average Order Value" value={formatSatangAsThb(data.averageOrderValueSatang)} />
    </div>
  );
}

function Card({ label, value }: { label: string; value: string }) {
  return (
    <div className="border border-line p-4">
      <p className="text-xs uppercase tracking-wide text-foreground/50">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
