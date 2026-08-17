import Link from "next/link";
import { getRecentOrdersForAdmin } from "@/lib/admin/get-admin-orders";
import { formatSatangAsThb } from "@/lib/money";
import { getFulfillmentStatusLabel, getPaymentStatusLabel } from "@/lib/orders/lifecycle";

export const metadata = { title: "Orders" };

export default async function AdminOrdersPage() {
  const orders = await getRecentOrdersForAdmin();

  return (
    <div>
      <h1 className="font-display text-2xl uppercase tracking-wide">Orders</h1>
      <p className="mt-1 text-sm text-foreground/60">Most recent {orders.length} orders.</p>

      {orders.length === 0 ? (
        <p className="mt-8 text-sm text-foreground/60">No orders yet.</p>
      ) : (
        <div className="mt-6 overflow-x-auto">
          <table className="w-full min-w-[720px] text-left text-sm">
            <thead>
              <tr className="border-b border-line text-xs uppercase tracking-wide text-foreground/50">
                <th className="py-2 pr-4 font-medium">Order</th>
                <th className="py-2 pr-4 font-medium">Customer</th>
                <th className="py-2 pr-4 font-medium">Phone</th>
                <th className="py-2 pr-4 font-medium">Payment</th>
                <th className="py-2 pr-4 font-medium">Fulfillment</th>
                <th className="py-2 pr-4 font-medium">Qty</th>
                <th className="py-2 pr-4 font-medium">Unit price</th>
                <th className="py-2 pr-4 font-medium">Total</th>
                <th className="py-2 font-medium">Created</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {orders.map((order) => (
                <tr key={order.orderNumber} className="border-b border-line/50">
                  <td className="py-2 pr-4">
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      className="font-medium underline underline-offset-4"
                    >
                      {order.orderNumber}
                    </Link>
                  </td>
                  <td className="py-2 pr-4">{order.customerName ?? "-"}</td>
                  <td className="py-2 pr-4">{order.customerPhone ?? "-"}</td>
                  <td className="py-2 pr-4">{getPaymentStatusLabel(order.paymentStatus)}</td>
                  <td className="py-2 pr-4">{getFulfillmentStatusLabel(order.fulfillmentStatus)}</td>
                  <td className="py-2 pr-4">{order.totalQuantity}</td>
                  <td className="py-2 pr-4">
                    {order.unitPriceSatang !== null ? formatSatangAsThb(order.unitPriceSatang) : "-"}
                  </td>
                  <td className="py-2 pr-4">{formatSatangAsThb(order.totalSatang)}</td>
                  <td className="py-2 text-foreground/60">
                    {new Date(order.createdAt).toLocaleString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
