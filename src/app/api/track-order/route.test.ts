import { beforeEach, describe, expect, it, vi } from "vitest";

const lookupMock = vi.fn();

vi.mock("@/lib/orders/get-order-by-order-number-and-phone", () => ({
  getOrderByOrderNumberAndPhone: (...args: unknown[]) => lookupMock(...args),
}));

const { POST } = await import("./route");

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/track-order", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const VALID_BODY = { orderNumber: "CM502-20260815-0001", phone: "081-234-5678" };

const FAKE_ORDER = {
  trackingToken: "a".repeat(32),
  orderNumber: "CM502-20260815-0001",
  paymentStatus: "awaiting_payment",
  fulfillmentStatus: "pending_payment",
  subtotalSatang: 99000,
  shippingFeeSatang: 5000,
  totalSatang: 104000,
  reservationExpiresAt: "2026-08-15T12:04:15.000Z",
  createdAt: "2026-08-15T11:49:15.000Z",
  shippingMethodName: "Standard Shipping",
  shippingAddress: {
    addressLine: "1 Test Rd.",
    subdistrict: "Test",
    district: "Test",
    province: "Bangkok",
    postalCode: "10110",
  },
  customerName: "Somchai Jaidee",
  items: [
    {
      productName: "CM502 University Jersey",
      colorName: "Black",
      sizeName: "M",
      quantity: 1,
      unitPriceSatang: 99000,
      lineTotalSatang: 99000,
    },
  ],
};

beforeEach(() => {
  lookupMock.mockReset();
});

describe("POST /api/track-order — valid lookup", () => {
  it("returns the order for a correct order number + phone", async () => {
    lookupMock.mockResolvedValue(FAKE_ORDER);
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.order.orderNumber).toBe("CM502-20260815-0001");
  });

  it("passes the normalized phone through to the lookup", async () => {
    lookupMock.mockResolvedValue(FAKE_ORDER);
    await POST(makeRequest(VALID_BODY));
    expect(lookupMock).toHaveBeenCalledWith("CM502-20260815-0001", "0812345678");
  });
});

describe("POST /api/track-order — generic error behavior", () => {
  it("returns a generic 404 for a wrong phone (lookup returns null)", async () => {
    lookupMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ orderNumber: "CM502-20260815-0001", phone: "0899999999" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("We couldn't find an order matching those details.");
  });

  it("returns the SAME generic 404 for a completely unknown order number", async () => {
    lookupMock.mockResolvedValue(null);
    const res = await POST(makeRequest({ orderNumber: "CM502-20260815-9999", phone: "081-234-5678" }));
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error.code).toBe("NOT_FOUND");
    expect(body.error.message).toBe("We couldn't find an order matching those details.");
  });

  it("wrong-phone and unknown-order responses are byte-for-byte identical", async () => {
    lookupMock.mockResolvedValue(null);
    const wrongPhoneRes = await POST(makeRequest({ orderNumber: "CM502-20260815-0001", phone: "0899999999" }));
    lookupMock.mockResolvedValue(null);
    const unknownOrderRes = await POST(makeRequest({ orderNumber: "CM502-20260815-9999", phone: "081-234-5678" }));

    expect(wrongPhoneRes.status).toBe(unknownOrderRes.status);
    expect(await wrongPhoneRes.json()).toEqual(await unknownOrderRes.json());
  });

  it("rejects a malformed order number without calling the lookup, using the same generic message", async () => {
    const res = await POST(makeRequest({ orderNumber: "not-an-order-number", phone: "081-234-5678" }));
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error.message).toBe("We couldn't find an order matching those details.");
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects malformed JSON with the same generic shape", async () => {
    const res = await POST(makeRequest("{not valid json"));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_FOUND");
  });
});

describe("POST /api/track-order — no internal IDs exposed", () => {
  it("the successful response never includes internal database IDs", async () => {
    lookupMock.mockResolvedValue(FAKE_ORDER);
    const res = await POST(makeRequest(VALID_BODY));
    const body = await res.json();
    const serialized = JSON.stringify(body);

    expect(body.order).not.toHaveProperty("id");
    expect(body.order).not.toHaveProperty("customerId");
    expect(body.order).not.toHaveProperty("addressId");
    expect(body.order).not.toHaveProperty("customer_id");
    // Loosely guard against a stray internal-looking UUID key sneaking in.
    expect(serialized).not.toMatch(/"(order|customer|address|payment)Id":/i);
  });
});
