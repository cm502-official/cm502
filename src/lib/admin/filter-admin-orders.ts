import type { AdminOrderSummary } from "./get-admin-orders";

/**
 * §11 — admin order search: partial, case-insensitive match against
 * order number, customer name, phone, or email. Pure function so it's
 * trivially testable and reusable regardless of how the table paginates
 * or filters on top of it.
 */
export function filterAdminOrders(orders: AdminOrderSummary[], query: string): AdminOrderSummary[] {
  const q = query.trim().toLowerCase();
  if (q === "") return orders;

  return orders.filter((order) =>
    [order.orderNumber, order.customerName, order.customerPhone, order.customerEmail]
      .filter((value): value is string => value != null)
      .some((value) => value.toLowerCase().includes(q)),
  );
}
