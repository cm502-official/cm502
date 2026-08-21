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

const ADDRESS_A = {
  address_line: "123/45",
  soi_road: null,
  subdistrict: "สุเทพ",
  district: "เมืองเชียงใหม่",
  province: "เชียงใหม่",
  postal_code: "50200",
  delivery_note: null,
};
const ADDRESS_B = {
  address_line: "88/8",
  soi_road: null,
  subdistrict: "คลองเตยเหนือ",
  district: "เขตวัฒนา",
  province: "กรุงเทพมหานคร",
  postal_code: "10110",
  delivery_note: null,
};

const ORDER_1 = {
  order_number: "CM502-20260821-0001",
  payment_status: "verified",
  fulfillment_status: "paid",
  customers: { full_name: "Order A", phone: "0810000000" },
  addresses: ADDRESS_A,
  order_items: [
    { color_name_snapshot: "Black", size_name_snapshot: "8XL", quantity: 1, customizations: [{ name: "Nachanok", number: "22" }] },
    { color_name_snapshot: "Black", size_name_snapshot: "2XL", quantity: 1, customizations: [{ name: "KORKOR", number: "10" }] },
  ],
};
const ORDER_2 = {
  order_number: "CM502-20260821-0002",
  payment_status: "verified",
  fulfillment_status: "paid",
  customers: { full_name: "Order B", phone: "0820000000" },
  addresses: ADDRESS_B,
  order_items: [
    { color_name_snapshot: "Navy", size_name_snapshot: "L", quantity: 1, customizations: [{ name: "NAME", number: "88" }] },
    { color_name_snapshot: "White", size_name_snapshot: "M", quantity: 1, customizations: [{ name: "TEST", number: "07" }] },
  ],
};
const CANCELLED_ORDER = {
  order_number: "CM502-CANCELLED-0001",
  payment_status: "verified",
  fulfillment_status: "cancelled",
  customers: { full_name: "Cancelled", phone: "0830000000" },
  addresses: ADDRESS_A,
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

describe("POST /api/admin/orders/bulk-production-export — multi-order grouping (§7/§8)", () => {
  it("continuously numbers across orders and puts address only on each order's first row", async () => {
    inMock.mockResolvedValue({ data: [ORDER_1, ORDER_2], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number, ORDER_2.order_number] }));
    const body = await res.json();
    expect(body.requiresConfirmation).toBe(false);
    expect(body.rows.map((r: { sequence: number }) => r.sequence)).toEqual([1, 2, 3, 4]);
    expect(body.rows[0].recipient).toBe("Order A");
    expect(body.rows[0].address).toContain("ต.สุเทพ");
    expect(body.rows[0].address).toContain("\n"); // two-line address (house/soi/road, then subdistrict/district/province/postcode)
    expect(body.rows[1].recipient).toBe("");
    expect(body.rows[1].address).toBe("");
    expect(body.rows[2].recipient).toBe("Order B");
    expect(body.rows[2].address).toContain("เขตวัฒนา");
    expect(body.rows[2].address).toContain("\n");
    expect(body.rows[3].recipient).toBe("");
    expect(body.rows[3].address).toBe("");
  });

  it("preserves the caller's requested order sequence, not database return order", async () => {
    // DB returns B before A — response rows must still follow the requested [A, B] order.
    inMock.mockResolvedValue({ data: [ORDER_2, ORDER_1], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number, ORDER_2.order_number] }));
    const body = await res.json();
    expect(body.rows[0].recipient).toBe("Order A");
    expect(body.rows[2].recipient).toBe("Order B");
  });

  it("never lets one order's address leak onto another order's rows", async () => {
    inMock.mockResolvedValue({ data: [ORDER_1, ORDER_2], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number, ORDER_2.order_number] }));
    const body = await res.json();
    const orderBRows = body.rows.slice(2);
    expect(orderBRows.every((r: { address: string }) => !r.address.includes("สุเทพ"))).toBe(true);
  });

  it("CSV headers are exactly the required 8 columns", async () => {
    inMock.mockResolvedValue({ data: [ORDER_1], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number] }));
    const body = await res.json();
    expect(body.csv.split("\n")[0]).toBe("#,Color,Size,Name,Number,Recipient,Phone,Address");
  });

  it("returns a real xlsx (zip) payload", async () => {
    inMock.mockResolvedValue({ data: [ORDER_1, ORDER_2], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number, ORDER_2.order_number] }));
    const body = await res.json();
    expect(Buffer.from(body.xlsxBase64, "base64").subarray(0, 2).toString()).toBe("PK");
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
      customers: { full_name: "Bad", phone: "0840000000" },
      addresses: ADDRESS_A,
      order_items: [{ color_name_snapshot: "Black", size_name_snapshot: "M", quantity: 1, customizations: [{ name: "Bad/Name", number: "1" }] }],
    };
    inMock.mockResolvedValue({ data: [ORDER_1, bad], error: null });
    const res = await POST(makeRequest({ orderNumbers: [ORDER_1.order_number, bad.order_number] }));
    const body = await res.json();
    expect(body.blockedOrders).toHaveLength(1);
    expect(body.blockedOrders[0].orderNumber).toBe("CM502-BAD");
  });
});
