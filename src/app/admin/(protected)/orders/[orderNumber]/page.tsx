import Link from "next/link";
import { notFound } from "next/navigation";
import { getAdminOrderDetail } from "@/lib/admin/get-admin-order-detail";
import { flattenOrderItemsToProductionRows } from "@/lib/admin/flatten-production-list";
import { formatSatangAsThb } from "@/lib/money";
import { getFulfillmentStatusLabel, getPaymentStatusLabel } from "@/lib/orders/lifecycle";

export const metadata = { title: "Order detail" };

export default async function AdminOrderDetailPage({
  params,
}: {
  params: Promise<{ orderNumber: string }>;
}) {
  const { orderNumber } = await params;
  const order = await getAdminOrderDetail(orderNumber);
  if (!order) notFound();

  // Historical snapshot data only (§ admin production visibility) —
  // never recomputed from live catalog/cart state.
  const productionRows = flattenOrderItemsToProductionRows(order.productionItems);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <Link href="/admin/orders" className="text-xs font-medium uppercase tracking-wide text-foreground/60 underline underline-offset-4">
          ← Orders
        </Link>
        <h1 className="mt-2 font-display text-2xl uppercase tracking-wide">{order.orderNumber}</h1>
      </div>

      <div className="grid grid-cols-1 gap-x-8 gap-y-2 border border-line p-4 text-sm sm:grid-cols-2">
        <Field label="Customer" value={order.customerName ?? "-"} />
        <Field label="Phone" value={order.customerPhone ?? "-"} />
        <Field label="Payment status" value={getPaymentStatusLabel(order.paymentStatus)} />
        <Field label="Fulfillment status" value={getFulfillmentStatusLabel(order.fulfillmentStatus)} />
        <Field label="Total quantity" value={`${order.totalQuantity} ตัว`} />
        <Field label="Unit price" value={order.unitPriceSatang !== null ? formatSatangAsThb(order.unitPriceSatang) : "-"} />
        <Field label="Subtotal" value={formatSatangAsThb(order.subtotalSatang)} />
        <Field label="Shipping" value={formatSatangAsThb(order.shippingFeeSatang)} />
        <Field label="Grand total" value={formatSatangAsThb(order.totalSatang)} />
        <Field
          label="Created"
          value={new Date(order.createdAt).toLocaleString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })}
        />
        {order.shippingMethodName && <Field label="Shipping method" value={order.shippingMethodName} />}
        {order.shippingAddress && (
          <Field
            label="Address"
            value={`${order.shippingAddress.addressLine}, ${order.shippingAddress.subdistrict}, ${order.shippingAddress.district}, ${order.shippingAddress.province} ${order.shippingAddress.postalCode}`}
          />
        )}
      </div>

      <div>
        <h2 className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Production list — {productionRows.length} shirt{productionRows.length === 1 ? "" : "s"}
        </h2>
        {productionRows.length === 0 ? (
          <p className="mt-3 text-sm text-foreground/60">
            No per-shirt customization saved for this order (placed before personalization existed).
          </p>
        ) : (
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead>
                <tr className="border-b border-line text-xs uppercase tracking-wide text-foreground/50">
                  <th className="py-2 pr-4 font-medium">#</th>
                  <th className="py-2 pr-4 font-medium">สี</th>
                  <th className="py-2 pr-4 font-medium">ไซซ์</th>
                  <th className="py-2 pr-4 font-medium">ชื่อ</th>
                  <th className="py-2 font-medium">เบอร์</th>
                </tr>
              </thead>
              <tbody className="tabular-nums">
                {productionRows.map((row) => (
                  <tr key={row.index} className="border-b border-line/50">
                    <td className="py-2 pr-4">{row.index}</td>
                    <td className="py-2 pr-4">{row.colorName}</td>
                    <td className="py-2 pr-4">{row.sizeName}</td>
                    <td className="py-2 pr-4">{row.name ?? "-"}</td>
                    <td className="py-2">{row.number ?? "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3 border-b border-line/50 py-1.5 sm:border-none sm:py-0">
      <span className="text-foreground/60">{label}</span>
      <span className="text-right font-medium">{value}</span>
    </div>
  );
}
