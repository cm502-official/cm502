import { getRecentOrdersForAdmin } from "@/lib/admin/get-admin-orders";
import { AdminOrdersTable } from "@/components/admin/admin-orders-table";

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
        <div className="mt-6">
          <AdminOrdersTable orders={orders} />
        </div>
      )}
    </div>
  );
}
