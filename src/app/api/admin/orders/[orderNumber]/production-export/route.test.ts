import { beforeEach, describe, expect, it, vi } from "vitest";

const getAdminUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const updateEqMock = vi.fn();
const updateSelectMock = vi.fn();

vi.mock("@/lib/admin/require-admin", () => ({
  getAdminUserOrNull: () => getAdminUserMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: maybeSingleMock }) }),
      update: () => ({ eq: updateEqMock }),
    }),
  })),
}));

const { GET, POST } = await import("./route");

function call(orderNumber = "CM502-20260821-0001") {
  const request = new Request(`http://localhost/api/admin/orders/${orderNumber}/production-export`);
  return { GET: () => GET(request, { params: Promise.resolve({ orderNumber }) }), POST: () => POST(request, { params: Promise.resolve({ orderNumber }) }) };
}

const CUSTOMER = { full_name: "Nachanok Example", phone: "0812345678" };
const ADDRESS = {
  address_line: "123/45 หมู่ 3",
  soi_road: null,
  subdistrict: "สุเทพ",
  district: "เมืองเชียงใหม่",
  province: "เชียงใหม่",
  postal_code: "50200",
  delivery_note: null,
};

beforeEach(() => {
  getAdminUserMock.mockReset();
  maybeSingleMock.mockReset();
  updateEqMock.mockReset();
  updateSelectMock.mockReset();
  updateEqMock.mockReturnValue({ select: updateSelectMock });
  updateSelectMock.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { order_number: "CM502-20260821-0001", production_exported_at: "2026-08-21T00:00:00Z" }, error: null }) });
  getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" });
});

describe("GET /api/admin/orders/[orderNumber]/production-export", () => {
  it("rejects a non-admin caller", async () => {
    getAdminUserMock.mockResolvedValue(null);
    const res = await call().GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown order", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await call().GET();
    expect(res.status).toBe(404);
  });

  it("groups the task-brief example: address only on the first shirt row", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        order_number: "CM502-20260821-0001",
        payment_status: "verified",
        fulfillment_status: "paid",
        production_exported_at: null,
        updated_at: "2026-08-21T00:00:00Z",
        order_edit_history: [],
        customers: CUSTOMER,
        addresses: ADDRESS,
        order_items: [
          { color_name_snapshot: "Black", size_name_snapshot: "8XL", quantity: 1, customizations: [{ name: "Nachanok", number: "22" }] },
          { color_name_snapshot: "Black", size_name_snapshot: "2XL", quantity: 1, customizations: [{ name: "KORKOR", number: "10" }] },
        ],
      },
      error: null,
    });
    const res = await call().GET();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.errors).toEqual([]);
    expect(body.rows).toEqual([
      { sequence: 1, color: "black", size: "8XL", name: "Nachanok", number: "22", recipient: "Nachanok Example", phone: "0812345678", address: "123/45 หมู่ 3 ต.สุเทพ อ.เมืองเชียงใหม่ จ.เชียงใหม่ 50200" },
      { sequence: 2, color: "black", size: "2XL", name: "KORKOR", number: "10", recipient: "", phone: "", address: "" },
    ]);
    expect(body.csv.split("\n")[0]).toBe("#,Color,Size,Name,Number,Recipient,Phone,Address");
    // xlsxBase64 decodes to a real zip (xlsx container) — starts with the "PK" local-file-header signature.
    expect(Buffer.from(body.xlsxBase64, "base64").subarray(0, 2).toString()).toBe("PK");
  });

  it("flags editedAfterExport when the most recent edit is after the last export", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        order_number: "CM502-1",
        payment_status: "verified",
        fulfillment_status: "paid",
        production_exported_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-22T00:00:00Z",
        order_edit_history: [{ edited_at: "2026-08-21T00:00:00Z" }],
        customers: null,
        addresses: null,
        order_items: [],
      },
      error: null,
    });
    const res = await call().GET();
    const body = await res.json();
    expect(body.editedAfterExport).toBe(true);
  });

  it("does not flag editedAfterExport when no edit happened since export (e.g. only a proof review touched the row)", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        order_number: "CM502-1",
        payment_status: "verified",
        fulfillment_status: "paid",
        production_exported_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-22T00:00:00Z", // bumped by an unrelated update
        order_edit_history: [],
        customers: null,
        addresses: null,
        order_items: [],
      },
      error: null,
    });
    const res = await call().GET();
    const body = await res.json();
    expect(body.editedAfterExport).toBe(false);
  });

  it("never emits null/undefined for a customer/address that's missing", async () => {
    maybeSingleMock.mockResolvedValue({
      data: {
        order_number: "CM502-1",
        payment_status: "verified",
        fulfillment_status: "paid",
        production_exported_at: null,
        updated_at: "2026-08-21T00:00:00Z",
        order_edit_history: [],
        customers: null,
        addresses: null,
        order_items: [{ color_name_snapshot: "Black", size_name_snapshot: "M", quantity: 1, customizations: [{ name: "N", number: "1" }] }],
      },
      error: null,
    });
    const res = await call().GET();
    const body = await res.json();
    expect(body.rows[0].recipient).toBe("");
    expect(body.rows[0].phone).toBe("");
    expect(body.rows[0].address).toBe("");
  });
});

describe("POST /api/admin/orders/[orderNumber]/production-export — mark exported", () => {
  it("rejects a non-admin caller", async () => {
    getAdminUserMock.mockResolvedValue(null);
    const res = await call().POST();
    expect(res.status).toBe(401);
  });

  it("marks the order exported and returns the timestamp", async () => {
    const res = await call().POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.productionExportedAt).toBe("2026-08-21T00:00:00Z");
  });

  it("allows re-export (no blocking check) — calling it twice both succeed", async () => {
    const first = await call().POST();
    const second = await call().POST();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
