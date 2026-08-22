import Link from "next/link";
import type { FlaggedOrder, NotSentToProductionSummary } from "@/lib/admin/report-calculations";

/**
 * §12 "Needs Attention" — three checks over Paid Orders only. Each is a
 * count with an expandable <details> list of the exact orders (linking
 * into the existing Admin Order Detail route, §13) — zero extra client
 * JS for the "กดแล้วดูว่าเป็น Order ไหนได้" expand interaction.
 */
export function ReportNeedsAttention({
  missingAddress,
  missingCustomization,
  notSentToProduction,
}: {
  missingAddress: FlaggedOrder[];
  missingCustomization: FlaggedOrder[];
  notSentToProduction: NotSentToProductionSummary;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
      <AttentionCard title="Missing Shipping Address" count={missingAddress.length} unit="Orders">
        <OrderList orders={missingAddress} />
      </AttentionCard>

      <AttentionCard title="Missing Customization" count={missingCustomization.length} unit="Orders">
        <OrderList orders={missingCustomization} />
      </AttentionCard>

      <AttentionCard
        title="Not Sent to Production"
        count={notSentToProduction.totalOrders}
        unit="Orders"
        secondaryCount={notSentToProduction.totalShirts}
        secondaryUnit="Shirts"
      >
        <OrderList orders={notSentToProduction.orders.map((o) => ({ orderNumber: o.orderNumber, customerName: o.customerName }))} />
      </AttentionCard>
    </div>
  );
}

function AttentionCard({
  title,
  count,
  unit,
  secondaryCount,
  secondaryUnit,
  children,
}: {
  title: string;
  count: number;
  unit: string;
  secondaryCount?: number;
  secondaryUnit?: string;
  children: React.ReactNode;
}) {
  const clear = count === 0;
  return (
    <div className={`border p-3 ${clear ? "border-line" : "border-accent/40 bg-accent/5"}`}>
      <p className="text-xs uppercase tracking-wide text-foreground/50">{title}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums ${clear ? "" : "text-accent"}`}>
        {count.toLocaleString("en-US")} <span className="text-sm font-normal text-foreground/50">{unit}</span>
      </p>
      {secondaryCount !== undefined && (
        <p className="text-xs text-foreground/50">
          {secondaryCount.toLocaleString("en-US")} {secondaryUnit}
        </p>
      )}
      {!clear && (
        <details className="mt-2">
          <summary className="cursor-pointer text-xs font-medium underline underline-offset-4">View orders</summary>
          <div className="mt-2">{children}</div>
        </details>
      )}
    </div>
  );
}

function OrderList({ orders }: { orders: FlaggedOrder[] }) {
  if (orders.length === 0) return null;
  return (
    <ul className="flex flex-col gap-1 text-xs">
      {orders.map((o) => (
        <li key={o.orderNumber}>
          <Link href={`/admin/orders/${o.orderNumber}`} className="underline underline-offset-4">
            {o.orderNumber}
          </Link>{" "}
          <span className="text-foreground/50">{o.customerName ?? ""}</span>
        </li>
      ))}
    </ul>
  );
}
