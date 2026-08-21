import { beforeEach, describe, expect, it, vi } from "vitest";

const getAdminUserMock = vi.fn();
const orderLookupMaybeSingleMock = vi.fn();
const rpcMock = vi.fn();

vi.mock("@/lib/admin/require-admin", () => ({
  getAdminUserOrNull: () => getAdminUserMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: orderLookupMaybeSingleMock }),
      }),
    }),
    rpc: (...args: unknown[]) => rpcMock(...args),
  })),
}));

const { POST } = await import("./route");

const VARIANT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const ORDER_ID = "6da0566f-266f-4ae4-baa9-d08c18a254cd";

// เชียงใหม่ → เมืองเชียงใหม่ → สุเทพ → 50200
const VALID_BODY = {
  customer: { fullName: "Somchai Jaidee", phone: "0812345678", email: "somchai@example.com" },
  address: {
    addressLine: "123/45",
    provinceId: 38,
    districtId: 5001,
    subdistrictId: 500108,
    postalCode: "50200",
  },
  items: [
    {
      variantId: VARIANT_ID,
      quantity: 1,
      customizations: [{ name: "Nachanok", number: "22" }],
    },
  ],
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/orders/CM502-1/edit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function call(request: Request, orderNumber = "CM502-20260818-0001") {
  return POST(request, { params: Promise.resolve({ orderNumber }) });
}

beforeEach(() => {
  getAdminUserMock.mockReset();
  orderLookupMaybeSingleMock.mockReset();
  rpcMock.mockReset();
  orderLookupMaybeSingleMock.mockResolvedValue({ data: { id: ORDER_ID }, error: null });
  rpcMock.mockResolvedValue({
    data: { order_id: ORDER_ID, subtotal_satang: 41900, total_satang: 46900, total_changed: false },
    error: null,
  });
});

describe("POST /api/admin/orders/[orderNumber]/edit — authorization", () => {
  it("rejects an unauthenticated/non-admin caller before touching the database", async () => {
    getAdminUserMock.mockResolvedValue(null);
    const res = await call(makeRequest(VALID_BODY));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/admin/orders/[orderNumber]/edit — validation", () => {
  beforeEach(() => getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" }));

  it("rejects malformed JSON", async () => {
    const res = await call(makeRequest("{not json"));
    expect(res.status).toBe(400);
  });

  it("rejects an empty item list", async () => {
    const res = await call(makeRequest({ ...VALID_BODY, items: [] }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid variant id", async () => {
    const res = await call(makeRequest({ ...VALID_BODY, items: [{ variantId: "not-a-uuid", quantity: 1, customizations: [{ name: null, number: null }] }] }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed Thai administrative combination", async () => {
    const res = await call(makeRequest({ ...VALID_BODY, address: { ...VALID_BODY.address, provinceId: 1 } }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a customization count mismatch", async () => {
    const res = await call(
      makeRequest({ ...VALID_BODY, items: [{ variantId: VARIANT_ID, quantity: 2, customizations: [{ name: null, number: null }] }] }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("returns 404 when the order doesn't exist", async () => {
    orderLookupMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await call(makeRequest(VALID_BODY));
    expect(res.status).toBe(404);
  });
});

describe("POST /api/admin/orders/[orderNumber]/edit — success", () => {
  beforeEach(() => getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" }));

  it("resolves the canonical Thai address and forwards ids/customer/items to the RPC", async () => {
    await call(makeRequest(VALID_BODY));
    const [fnName, rpcArgs] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(fnName).toBe("admin_update_order_details");
    expect(rpcArgs.p_order_id).toBe(ORDER_ID);
    expect(rpcArgs.p_address).toMatchObject({
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postal_code: "50200",
    });
    expect(rpcArgs.p_items).toEqual([{ variant_id: VARIANT_ID, quantity: 1, customizations: [{ name: "Nachanok", number: "22" }] }]);
  });

  it("returns the recalculated subtotal/total", async () => {
    const res = await call(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toEqual({ orderNumber: "CM502-20260818-0001", subtotalSatang: 41900, totalSatang: 46900, totalChanged: false });
  });

  it("defaults confirmTotalChange to false when omitted", async () => {
    await call(makeRequest(VALID_BODY));
    const [, rpcArgs] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcArgs.p_confirm_total_change).toBe(false);
  });

  it("forwards an explicit confirmTotalChange: true", async () => {
    await call(makeRequest({ ...VALID_BODY, confirmTotalChange: true }));
    const [, rpcArgs] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcArgs.p_confirm_total_change).toBe(true);
  });
});

describe("POST /api/admin/orders/[orderNumber]/edit — payment-safety confirmation gate", () => {
  beforeEach(() => getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" }));

  it("surfaces CM302 (verified order, total would change) as 409 CONFIRM_TOTAL_CHANGE_REQUIRED, never silently applying it", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "CM302", message: "internal detail" } });
    const res = await call(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe("CONFIRM_TOTAL_CHANGE_REQUIRED");
    expect(body.error.message).not.toMatch(/internal detail/);
  });

  it("maps an out-of-stock database error to a customer-safe response", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "CM005", message: "CM502-JERSEY-BLACK-M: only 0 left" } });
    const res = await call(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(res.status).toBe(400);
    expect(body.error.code).toBe("OUT_OF_STOCK");
    expect(body.error.message).not.toMatch(/CM502-JERSEY/);
  });

  it("never leaks a raw database error message for an unrecognized code", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "42P01", message: 'relation "x" does not exist' } });
    const res = await call(makeRequest(VALID_BODY));
    const body = await res.json();
    expect(body.error.code).toBe("EDIT_FAILED");
    expect(body.error.message).not.toMatch(/relation|does not exist/i);
  });
});
