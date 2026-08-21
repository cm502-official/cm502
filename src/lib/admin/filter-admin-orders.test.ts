import { describe, expect, it } from "vitest";
import { filterAdminOrders } from "./filter-admin-orders";
import type { AdminOrderSummary } from "./get-admin-orders";

function makeOrder(overrides: Partial<AdminOrderSummary> & { orderNumber: string }): AdminOrderSummary {
  return {
    customerName: null,
    customerPhone: null,
    customerEmail: null,
    paymentStatus: "awaiting_payment",
    fulfillmentStatus: "pending_payment",
    totalQuantity: 1,
    unitPriceSatang: 41900,
    subtotalSatang: 41900,
    shippingFeeSatang: 6000,
    totalSatang: 47900,
    createdAt: "2026-08-21T00:00:00Z",
    ...overrides,
  };
}

const ORDERS: AdminOrderSummary[] = [
  makeOrder({ orderNumber: "CM502-20260821-0001", customerName: "Nachanok Suksawat", customerPhone: "0812345678", customerEmail: "nachanok@example.com" }),
  makeOrder({ orderNumber: "CM502-20260821-0002", customerName: "Somchai Jaidee", customerPhone: "0899999999", customerEmail: "somchai@example.com" }),
];

describe("filterAdminOrders", () => {
  it("returns everything when the query is blank", () => {
    expect(filterAdminOrders(ORDERS, "")).toEqual(ORDERS);
    expect(filterAdminOrders(ORDERS, "   ")).toEqual(ORDERS);
  });

  it("matches a partial order number, case-insensitively", () => {
    expect(filterAdminOrders(ORDERS, "0001")).toEqual([ORDERS[0]]);
  });

  it("matches a partial customer name", () => {
    expect(filterAdminOrders(ORDERS, "somchai")).toEqual([ORDERS[1]]);
  });

  it("matches a partial phone number", () => {
    expect(filterAdminOrders(ORDERS, "999999")).toEqual([ORDERS[1]]);
  });

  it("matches a partial email", () => {
    expect(filterAdminOrders(ORDERS, "nachanok@")).toEqual([ORDERS[0]]);
  });

  it("returns an empty array when nothing matches", () => {
    expect(filterAdminOrders(ORDERS, "no-such-order")).toEqual([]);
  });

  it("never throws on orders with null name/phone/email", () => {
    const withNulls = [makeOrder({ orderNumber: "CM502-NULLS" })];
    expect(() => filterAdminOrders(withNulls, "anything")).not.toThrow();
    expect(filterAdminOrders(withNulls, "CM502-NULLS")).toEqual(withNulls);
  });
});
