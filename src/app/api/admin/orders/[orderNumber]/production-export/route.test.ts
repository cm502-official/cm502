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

beforeEach(() => {
  getAdminUserMock.mockReset();
  maybeSingleMock.mockReset();
  updateEqMock.mockReset();
  updateSelectMock.mockReset();
  updateEqMock.mockReturnValue({ select: updateSelectMock });
  updateSelectMock.mockReturnValue({ maybeSingle: vi.fn().mockResolvedValue({ data: { order_number: "CM502-20260821-0001", production_exported_at: "2026-08-21T00:00:00Z" }, error: null }) });
});

describe("GET /api/admin/orders/[orderNumber]/production-export", () => {
  it("rejects a non-admin caller", async () => {
    getAdminUserMock.mockResolvedValue(null);
    const res = await call().GET();
    expect(res.status).toBe(401);
  });

  it("returns 404 for an unknown order", async () => {
    getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" });
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await call().GET();
    expect(res.status).toBe(404);
  });

  it("returns the exact required TXT for the task-brief example", async () => {
    getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" });
    maybeSingleMock.mockResolvedValue({
      data: {
        order_number: "CM502-20260821-0001",
        payment_status: "verified",
        fulfillment_status: "paid",
        production_exported_at: null,
        updated_at: "2026-08-21T00:00:00Z",
        order_edit_history: [],
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
    expect(body.txt).toBe("1/black/8XL/Nachanok/22\n2/black/2XL/KORKOR/10");
    expect(body.errors).toEqual([]);
  });

  it("flags editedAfterExport when the most recent edit is after the last export", async () => {
    getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" });
    maybeSingleMock.mockResolvedValue({
      data: {
        order_number: "CM502-1",
        payment_status: "verified",
        fulfillment_status: "paid",
        production_exported_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-22T00:00:00Z",
        order_edit_history: [{ edited_at: "2026-08-21T00:00:00Z" }],
        order_items: [],
      },
      error: null,
    });
    const res = await call().GET();
    const body = await res.json();
    expect(body.editedAfterExport).toBe(true);
  });

  it("does not flag editedAfterExport when no edit happened since export (e.g. only a proof review touched the row)", async () => {
    getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" });
    maybeSingleMock.mockResolvedValue({
      data: {
        order_number: "CM502-1",
        payment_status: "verified",
        fulfillment_status: "paid",
        production_exported_at: "2026-08-20T00:00:00Z",
        updated_at: "2026-08-22T00:00:00Z", // bumped by an unrelated update
        order_edit_history: [],
        order_items: [],
      },
      error: null,
    });
    const res = await call().GET();
    const body = await res.json();
    expect(body.editedAfterExport).toBe(false);
  });
});

describe("POST /api/admin/orders/[orderNumber]/production-export — mark exported", () => {
  it("rejects a non-admin caller", async () => {
    getAdminUserMock.mockResolvedValue(null);
    const res = await call().POST();
    expect(res.status).toBe(401);
  });

  it("marks the order exported and returns the timestamp", async () => {
    getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" });
    const res = await call().POST();
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.productionExportedAt).toBe("2026-08-21T00:00:00Z");
  });

  it("allows re-export (no blocking check) — calling it twice both succeed", async () => {
    getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" });
    const first = await call().POST();
    const second = await call().POST();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
  });
});
