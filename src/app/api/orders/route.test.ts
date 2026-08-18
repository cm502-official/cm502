import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const createAdminClientMock = vi.fn(() => ({ rpc: rpcMock }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

// Imported after the mock is registered so route.ts picks up the mocked module.
const { POST } = await import("./route");

const VARIANT_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";
const SHIPPING_METHOD_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa7";

const validPayload = {
  idempotencyKey: "key-1",
  items: [
    {
      variantId: VARIANT_ID,
      quantity: 2,
      customizations: [
        { name: "LUCIFER", number: "88" },
        { name: null, number: null },
      ],
    },
  ],
  customer: { fullName: "Somchai Jaidee", phone: "0812345678", email: "somchai@example.com" },
  // เชียงใหม่ → เมืองเชียงใหม่ → สุเทพ → 50200 (task-brief example).
  address: {
    addressLine: "123/45",
    soiRoad: "ซอย 5",
    provinceId: 38,
    districtId: 5001,
    subdistrictId: 500108,
    postalCode: "50200",
  },
  shippingMethodId: SHIPPING_METHOD_ID,
};

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/orders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function makeRpcSuccess(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    data: {
      order_number: "CM502-20260815-0001",
      tracking_token: "a".repeat(32),
      total_satang: 500,
      reservation_expires_at: "2026-08-15T12:00:00Z",
      idempotent_replay: false,
      ...overrides,
    },
    error: null,
  };
}

beforeEach(() => {
  rpcMock.mockReset();
  createAdminClientMock.mockClear();
  createAdminClientMock.mockImplementation(() => ({ rpc: rpcMock }));
});

describe("POST /api/orders — request validation", () => {
  it("rejects malformed JSON without touching the database", async () => {
    const res = await POST(makeRequest("{not valid json"));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a request missing required fields, never reaching the database", async () => {
    const res = await POST(makeRequest({ ...validPayload, customer: { fullName: "", phone: "" } }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a request missing the now-required email, never reaching the database", async () => {
    const res = await POST(
      makeRequest({ ...validPayload, customer: { fullName: "Somchai Jaidee", phone: "0812345678" } }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a malformed administrative combination before calling the database", async () => {
    // Bangkok (id 1) does not own subdistrict 500108 (Suthep, Chiang Mai).
    const res = await POST(
      makeRequest({ ...validPayload, address: { ...validPayload.address, provinceId: 1 } }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an empty cart before calling the database", async () => {
    const res = await POST(makeRequest({ ...validPayload, items: [] }));
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a customization count mismatch (§22) before calling the database", async () => {
    const res = await POST(
      makeRequest({
        ...validPayload,
        items: [{ variantId: VARIANT_ID, quantity: 3, customizations: [{ name: null, number: null }] }],
      }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an invalid jersey number before calling the database", async () => {
    const res = await POST(
      makeRequest({
        ...validPayload,
        items: [{ variantId: VARIANT_ID, quantity: 1, customizations: [{ name: null, number: "100" }] }],
      }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a name longer than 15 characters before calling the database", async () => {
    const res = await POST(
      makeRequest({
        ...validPayload,
        items: [{ variantId: VARIANT_ID, quantity: 1, customizations: [{ name: "A".repeat(16), number: null }] }],
      }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders — server is the sole source of pricing", () => {
  it("never forwards client-supplied price/subtotal/shipping/total fields to the database function", async () => {
    rpcMock.mockResolvedValue(makeRpcSuccess());

    // An adversarial client stuffs price fields into every place it can.
    const payloadWithInjectedPrices = {
      ...validPayload,
      items: [
        {
          variantId: VARIANT_ID,
          quantity: 2,
          customizations: [
            { name: "LUCIFER", number: "88" },
            { name: null, number: null },
          ],
          unitPriceSatang: 1,
          lineTotalSatang: 1,
        },
      ],
      subtotalSatang: 1,
      shippingSatang: 1,
      totalSatang: 1,
    };

    const res = await POST(makeRequest(payloadWithInjectedPrices));
    expect(res.status).toBe(201);
    expect(rpcMock).toHaveBeenCalledTimes(1);

    const [, rpcArgs] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcArgs).not.toHaveProperty("p_subtotal_satang");
    expect(rpcArgs).not.toHaveProperty("p_total_satang");
    expect(rpcArgs).not.toHaveProperty("p_shipping_satang");

    const items = rpcArgs.p_items as Array<Record<string, unknown>>;
    expect(items).toEqual([
      {
        variant_id: VARIANT_ID,
        quantity: 2,
        customizations: [
          { name: "LUCIFER", number: "88" },
          { name: null, number: null },
        ],
      },
    ]);
    expect(items[0]).not.toHaveProperty("unitPriceSatang");
    expect(items[0]).not.toHaveProperty("lineTotalSatang");
  });

  it("the response body carries no client-controllable pricing — total comes straight from the RPC result", async () => {
    rpcMock.mockResolvedValue(makeRpcSuccess({ total_satang: 84000 }));
    const res = await POST(makeRequest({ ...validPayload, totalSatang: 1 }));
    const body = await res.json();
    expect(body.order.totalSatang).toBe(84000);
  });
});

describe("POST /api/orders — shipping address is forwarded and server-resolved", () => {
  it("forwards the complete shipping address, resolving canonical names from the selected ids", async () => {
    rpcMock.mockResolvedValue(makeRpcSuccess());
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(201);

    const [, rpcArgs] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcArgs.p_address).toEqual({
      address_line: "123/45",
      soi_road: "ซอย 5",
      subdistrict: "สุเทพ",
      district: "เมืองเชียงใหม่",
      province: "เชียงใหม่",
      postal_code: "50200",
      delivery_note: "",
    });
  });

  it("never trusts client-supplied names — an adversarial mismatched postal code is rejected, not forwarded", async () => {
    rpcMock.mockResolvedValue(makeRpcSuccess());
    const res = await POST(
      makeRequest({ ...validPayload, address: { ...validPayload.address, postalCode: "10110" } }),
    );
    expect(res.status).toBe(400);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("forwards an optional delivery note when supplied", async () => {
    rpcMock.mockResolvedValue(makeRpcSuccess());
    await POST(
      makeRequest({
        ...validPayload,
        address: { ...validPayload.address, deliveryNote: "ฝากไว้กับ รปภ." },
      }),
    );
    const [, rpcArgs] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect((rpcArgs.p_address as Record<string, unknown>).delivery_note).toBe("ฝากไว้กับ รปภ.");
  });
});

describe("POST /api/orders — success response shape", () => {
  it("returns 201 with only customer-safe order fields, no internal IDs", async () => {
    rpcMock.mockResolvedValue(
      makeRpcSuccess({
        order_number: "CM502-20260815-0002",
        tracking_token: "b".repeat(32),
        total_satang: 99000,
      }),
    );
    const res = await POST(makeRequest(validPayload));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.order).toEqual({
      orderNumber: "CM502-20260815-0002",
      trackingToken: "b".repeat(32),
      totalSatang: 99000,
      reservationExpiresAt: "2026-08-15T12:00:00Z",
    });
    expect(body.order).not.toHaveProperty("id");
    expect(body.order).not.toHaveProperty("customerId");
  });
});

describe("POST /api/orders — idempotency", () => {
  it("passes the client idempotency key straight through to the database function", async () => {
    rpcMock.mockResolvedValue(makeRpcSuccess());
    await POST(makeRequest(validPayload));
    const [, rpcArgs] = rpcMock.mock.calls[0] as [string, Record<string, unknown>];
    expect(rpcArgs.p_idempotency_key).toBe("key-1");
  });

  it("a replayed idempotency key returns 200 (not 201) — no new order is implied", async () => {
    rpcMock.mockResolvedValue(makeRpcSuccess({ idempotent_replay: true }));
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(200);
  });

  it("a fresh order returns 201", async () => {
    rpcMock.mockResolvedValue(makeRpcSuccess({ idempotent_replay: false }));
    const res = await POST(makeRequest(validPayload));
    expect(res.status).toBe(201);
  });
});

describe("POST /api/orders — error mapping never leaks internals", () => {
  it("maps an out-of-stock database error to a customer-safe response", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "CM005", message: "CM502-JERSEY-BLACK-M: only 0 left in stock" },
    });
    const res = await POST(makeRequest(validPayload));
    const body = await res.json();

    expect(res.status).toBe(409);
    expect(body.error.code).toBe("OUT_OF_STOCK");
    expect(body.error.message).not.toMatch(/CM502-JERSEY/);
    expect(body.error.message).not.toMatch(/SKU/i);
  });

  it("maps an unavailable-item database error to a customer-safe response", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { code: "CM004", message: "internal detail" } });
    const res = await POST(makeRequest(validPayload));
    const body = await res.json();
    expect(res.status).toBe(409);
    expect(body.error.code).toBe("ITEM_UNAVAILABLE");
  });

  it("maps an unrecognized database error code to a generic failure, not a leak", async () => {
    rpcMock.mockResolvedValue({
      data: null,
      error: { code: "42P01", message: 'relation "orders" does not exist' },
    });
    const res = await POST(makeRequest(validPayload));
    const body = await res.json();
    expect(body.error.code).toBe("ORDER_CREATION_FAILED");
    expect(body.error.message).not.toMatch(/relation|orders/i);
  });

  it("never fakes a successful order when the database is unreachable", async () => {
    createAdminClientMock.mockImplementationOnce(() => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
    });
    const res = await POST(makeRequest(validPayload));
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error.code).toBe("SERVICE_UNAVAILABLE");
    expect(body.order).toBeUndefined();
    expect(body.error.message).not.toMatch(/ECONNREFUSED|5432/);
  });
});
