import { beforeEach, describe, expect, it, vi } from "vitest";

const getAdminUserMock = vi.fn();
const inMock = vi.fn();

vi.mock("@/lib/admin/require-admin", () => ({
  getAdminUserOrNull: () => getAdminUserMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({ in: (...args: unknown[]) => inMock(...args) }),
    }),
  })),
}));

const { POST } = await import("./route");

const ORDER_1 = {
  order_number: "CM502-20260821-0001",
  payment_status: "verified",
  fulfillment_status: "paid",
  order_items: [
    { color_name_snapshot: "Black", size_name_snapshot: "8XL", quantity: 1, customizations: [{ name: "Nachanok", number: "22" }] },
    { color_name_snapshot: "Black", size_name_snapshot: "2XL", quantity: 1, customizations: [{ name: "KORKOR", number: "10" }] },
  ],
};
const ORDER_2 = {
  order_number: "CM502-20260821-0002",
  payment_status: "verified",
  fulfillment_status: "paid",
  order_items: [
    { color_name_snapshot: "Navy", size_name_snapshot: "L", quantity: 1, customizations: [{ name: "NAME", number: "88" }] },
    { color_name_snapshot: "White", size_name_snapshot: "M", quantity: 1, customizations: [{ name: "TEST", number: "07" }] },
  ],
};
const CANCELLED_ORDER = {
  order_number: "CM502-CANCELLED-0001",
  payment_status: "verified",
  fulfillment_status: "cancelled",
  order_items: [{ color_name_snapshot: "Black", size_name_snapshot: "M", quantity: 1, customizations: [{ name: null, number: null }] }],
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/orders/bulk-production-export", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  getAdminUserMock.mockReset();
  inMock.mockReset();
  getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" });
});

describe("POST /api/admin/orders/bulk-production-export — authorization", () => {
  it("rejects a non-admin caller", async () => {
    getAdminUserMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ orderNumbers: ["CM502-1"] }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/orders/bulk-production-export — validation", () => {
  it("rejects an empty order list", async () => {
    const res = await POST(makeRequest({ orderNumbers: [] }));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/orders/bulk-production-export — multi-order grouped export", () => {
  it("matches the task-brief grouped example exactly", async () => {
    inMock.mockResolvedValue({ data: [ORDER_1, ORDER_2], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number, ORDER_2.order_number] }));
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(false);
    expect(body.groupedTxt).toBe(
      [
        "# CM502-20260821-0001",
        "1/black/8XL/Nachanok/22",
        "2/black/2XL/KORKOR/10",
        "# CM502-20260821-0002",
        "1/navy/L/NAME/88",
        "2/white/M/TEST/07",
      ].join("\n"),
    );
  });

  it("raw mode has no headers and renumbers continuously", async () => {
    inMock.mockResolvedValue({ data: [ORDER_1, ORDER_2], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number, ORDER_2.order_number], mode: "raw" }));
    const body = await res.json();
    expect(body.txt).not.toContain("#");
    expect(body.txt).toBe(["1/black/8XL/Nachanok/22", "2/black/2XL/KORKOR/10", "3/navy/L/NAME/88", "4/white/M/TEST/07"].join("\n"));
  });
});

describe("POST /api/admin/orders/bulk-production-export — cancelled-order exclusion (§13)", () => {
  it("requires confirmation instead of silently including a cancelled order", async () => {
    inMock.mockResolvedValue({ data: [ORDER_1, CANCELLED_ORDER], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number, CANCELLED_ORDER.order_number] }));
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
    expect(body.unsafeOrders.map((o: { orderNumber: string }) => o.orderNumber)).toEqual([CANCELLED_ORDER.order_number]);
  });

  it("includes the cancelled order once includeUnsafe is explicitly confirmed", async () => {
    inMock.mockResolvedValue({ data: [ORDER_1, CANCELLED_ORDER], error: null });
    const res = await POST(
      makeRequest({ orderNumbers: [ORDER_1.order_number, CANCELLED_ORDER.order_number], includeUnsafe: true }),
    );
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(false);
    expect(body.orderCount).toBe(2);
  });

  it("requires confirmation for an unpaid order", async () => {
    const unpaid = { ...ORDER_1, order_number: "CM502-UNPAID", payment_status: "awaiting_payment" };
    inMock.mockResolvedValue({ data: [unpaid], error: null });
    const res = await POST(makeRequest({ orderNumbers: [unpaid.order_number] }));
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(true);
  });
});

describe("POST /api/admin/orders/bulk-production-export — corrupt customization blocking", () => {
  it("surfaces a blocked order without corrupting the rest of the export", async () => {
    const bad = {
      order_number: "CM502-BAD",
      payment_status: "verified",
      fulfillment_status: "paid",
      order_items: [{ color_name_snapshot: "Black", size_name_snapshot: "M", quantity: 1, customizations: [{ name: "Bad/Name", number: "1" }] }],
    };
    inMock.mockResolvedValue({ data: [ORDER_1, bad], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number, bad.order_number] }));
    const body = await res.json();
    expect(body.blockedOrders).toHaveLength(1);
    expect(body.blockedOrders[0].orderNumber).toBe("CM502-BAD");
  });
});
