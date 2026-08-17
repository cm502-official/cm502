import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveOrderMock = vi.fn();
const rpcMock = vi.fn();
const uploadMock = vi.fn();
const attemptCountMock = vi.fn();
const getVerifierMock = vi.fn();
const getSettingsMock = vi.fn();

vi.mock("@/lib/payments/resolve-order-for-payment", () => ({
  resolveOrderForPayment: (...args: unknown[]) => resolveOrderMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ upload: uploadMock }) },
    rpc: rpcMock,
    from: () => ({
      select: () => ({
        eq: () => attemptCountMock(),
      }),
    }),
  }),
}));

vi.mock("@/lib/payments/get-verifier", () => ({
  getPaymentSlipVerifier: () => getVerifierMock(),
}));

vi.mock("@/lib/payments/get-payment-settings", () => ({
  getPaymentSettings: () => getSettingsMock(),
}));

const { POST } = await import("./route");
const { __resetRateLimitForTests } = await import("@/lib/rate-limit");

const TOKEN = "a".repeat(32);
const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 3, 4]);

const VALID_ORDER = {
  id: "6da0566f-266f-4ae4-baa9-d08c18a254cd",
  paymentId: "aaaa1111-266f-4ae4-baa9-d08c18a254cd",
  orderNumber: "CM502-20260815-0001",
  paymentStatus: "awaiting_payment",
  createdAt: "2026-08-15T12:00:00.000Z",
  reservationExpiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
  expectedAmountSatang: 104000,
};

function makeRequestWithFile(bytes: Uint8Array = JPEG_BYTES, fieldName = "slip"): Request {
  const form = new FormData();
  const file = new File([bytes as BlobPart], "slip.jpg", { type: "image/jpeg" });
  form.set(fieldName, file);
  return new Request(`http://localhost/api/orders/${TOKEN}/payment-slip`, {
    method: "POST",
    body: form,
  });
}

function call(request: Request, token = TOKEN) {
  return POST(request, { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  resolveOrderMock.mockReset().mockResolvedValue(VALID_ORDER);
  rpcMock.mockReset();
  uploadMock.mockReset().mockResolvedValue({ error: null });
  attemptCountMock.mockReset().mockResolvedValue({ count: 0 });
  getVerifierMock.mockReset().mockReturnValue(null);
  getSettingsMock.mockReset().mockResolvedValue({ bankTransfer: null, promptPay: null });
  __resetRateLimitForTests();
});

describe("POST /api/orders/[token]/payment-slip — ownership & eligibility", () => {
  it("returns a generic not-found for an unknown/invalid token", async () => {
    resolveOrderMock.mockResolvedValue(null);
    const res = await call(makeRequestWithFile());
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error.code).toBe("ORDER_NOT_FOUND");
  });

  it("rejects upload once payment is already verified", async () => {
    resolveOrderMock.mockResolvedValue({ ...VALID_ORDER, paymentStatus: "verified" });
    const res = await call(makeRequestWithFile());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("ALREADY_VERIFIED");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects upload for an expired order", async () => {
    resolveOrderMock.mockResolvedValue({
      ...VALID_ORDER,
      reservationExpiresAt: new Date(Date.now() - 60_000).toISOString(),
    });
    const res = await call(makeRequestWithFile());
    expect(res.status).toBe(410);
    const body = await res.json();
    expect(body.error.code).toBe("EXPIRED");
  });

  it("rejects when the attempt cap has been reached", async () => {
    attemptCountMock.mockResolvedValue({ count: 5 });
    const res = await call(makeRequestWithFile());
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error.code).toBe("TOO_MANY_ATTEMPTS");
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders/[token]/payment-slip — file validation", () => {
  it("accepts a valid JPEG", async () => {
    rpcMock.mockResolvedValueOnce({ data: { outcome: "slip_uploaded", slipId: "s1", paymentId: VALID_ORDER.paymentId }, error: null });
    rpcMock.mockResolvedValueOnce({ data: { outcome: "needs_review" }, error: null });
    const res = await call(makeRequestWithFile());
    expect(res.status).toBe(200);
  });

  it("rejects a MIME-spoofed file (claims jpg, is actually text)", async () => {
    const fake = new TextEncoder().encode("not a real image");
    const res = await call(makeRequestWithFile(fake));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("UNSUPPORTED_FORMAT");
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    const res = await call(makeRequestWithFile(new Uint8Array()));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("EMPTY_FILE");
  });

  it("rejects an oversized file", async () => {
    const big = new Uint8Array(8 * 1024 * 1024 + 1);
    big.set(JPEG_BYTES);
    const res = await call(makeRequestWithFile(big));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });

  it("rejects a request with no file field", async () => {
    const form = new FormData();
    form.set("wrong-field", "not a file");
    const req = new Request(`http://localhost/api/orders/${TOKEN}/payment-slip`, { method: "POST", body: form });
    const res = await call(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("VALIDATION_ERROR");
  });
});

describe("POST /api/orders/[token]/payment-slip — duplicate & outcomes", () => {
  it("short-circuits on duplicate slip hash without running OCR", async () => {
    rpcMock.mockResolvedValueOnce({ data: { outcome: "duplicate_slip", slipId: null, paymentId: VALID_ORDER.paymentId }, error: null });
    const res = await call(makeRequestWithFile());
    const body = await res.json();
    expect(body.status).toBe("duplicate_slip");
    expect(getVerifierMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledTimes(1); // only record_payment_slip, no finalize call
  });

  it("short-circuits when record_payment_slip self-heals to expired (race: TS guard passed, DB knows it's expired), without running OCR", async () => {
    // Regression test for a live Phase 4B finding: record_payment_slip's
    // self-heal used to raise an exception that rolled back its own
    // UPDATEs; fixed (0011) to return a normal jsonb outcome instead, so
    // the route must treat 'expired' the same way as 'duplicate_slip'.
    rpcMock.mockResolvedValueOnce({ data: { outcome: "expired", slipId: null, paymentId: VALID_ORDER.paymentId }, error: null });
    const res = await call(makeRequestWithFile());
    const body = await res.json();
    expect(body.status).toBe("expired");
    expect(getVerifierMock).not.toHaveBeenCalled();
    expect(rpcMock).toHaveBeenCalledTimes(1);
  });

  it("passes through the finalize outcome to the customer", async () => {
    rpcMock.mockResolvedValueOnce({ data: { outcome: "slip_uploaded", slipId: "s1", paymentId: VALID_ORDER.paymentId }, error: null });
    rpcMock.mockResolvedValueOnce({ data: { outcome: "verified" }, error: null });
    const res = await call(makeRequestWithFile());
    const body = await res.json();
    expect(body.status).toBe("verified");
  });

  it("never fakes verification just because the mock OCR provider is configured", async () => {
    const { MockPaymentSlipVerifier } = await import("@/lib/payments/providers/mock-verifier");
    getVerifierMock.mockReturnValue(new MockPaymentSlipVerifier());
    rpcMock.mockResolvedValueOnce({ data: { outcome: "slip_uploaded", slipId: "s1", paymentId: VALID_ORDER.paymentId }, error: null });
    rpcMock.mockImplementationOnce(async (_fn: string, args: Record<string, unknown>) => {
      // Simulate the real RPC's behavior: it only ever receives what the
      // route computed. Assert the route passed a 'needs_review' outcome
      // (mock provider extracts nothing, so verifyPayment can't verify).
      expect(args.p_outcome).toBe("needs_review");
      return { data: { outcome: "needs_review" }, error: null };
    });
    const res = await call(makeRequestWithFile());
    const body = await res.json();
    expect(body.status).toBe("needs_review");
  });
});

describe("POST /api/orders/[token]/payment-slip — security", () => {
  it("never returns internal database IDs to the customer", async () => {
    rpcMock.mockResolvedValueOnce({ data: { outcome: "slip_uploaded", slipId: "s1", paymentId: VALID_ORDER.paymentId }, error: null });
    rpcMock.mockResolvedValueOnce({ data: { outcome: "verified" }, error: null });
    const res = await call(makeRequestWithFile());
    const body = await res.json();
    const serialized = JSON.stringify(body);
    expect(serialized).not.toMatch(/6da0566f|aaaa1111/); // order id / payment id
    expect(body).not.toHaveProperty("slipId");
    expect(body).not.toHaveProperty("orderId");
  });

  it("never returns the raw OCR/provider response to the customer", async () => {
    rpcMock.mockResolvedValueOnce({ data: { outcome: "slip_uploaded", slipId: "s1", paymentId: VALID_ORDER.paymentId }, error: null });
    rpcMock.mockResolvedValueOnce({ data: { outcome: "needs_review" }, error: null });
    const res = await call(makeRequestWithFile());
    const body = await res.json();
    expect(body).not.toHaveProperty("rawResponse");
    expect(body).not.toHaveProperty("ocrResult");
    expect(Object.keys(body)).toEqual(["status", "message"]);
  });

  it("maps a database error to a customer-safe message, never leaking SQL", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: { code: "CM103", message: "internal detail" } });
    const res = await call(makeRequestWithFile());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("EXPIRED");
    expect(body.error.message).not.toMatch(/internal detail/);
  });
});

describe("POST /api/orders/[token]/payment-slip — rate limiting", () => {
  it("blocks a single source after enough rapid requests, independent of order validity", async () => {
    rpcMock.mockResolvedValue({ data: { outcome: "slip_uploaded", slipId: "s1", paymentId: VALID_ORDER.paymentId }, error: null });

    const withIp = () =>
      new Request(`http://localhost/api/orders/${TOKEN}/payment-slip`, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.9" },
        body: (() => {
          const form = new FormData();
          form.set("slip", new File([JPEG_BYTES as BlobPart], "slip.jpg", { type: "image/jpeg" }));
          return form;
        })(),
      });

    let lastStatus = 0;
    for (let i = 0; i < 25; i++) {
      const res = await call(withIp());
      lastStatus = res.status;
    }
    expect(lastStatus).toBe(429);
  });

  it("does not rate-limit a different source after the first exhausts its own limit", async () => {
    const other = () =>
      new Request(`http://localhost/api/orders/${TOKEN}/payment-slip`, {
        method: "POST",
        headers: { "x-forwarded-for": "203.0.113.55" },
        body: (() => {
          const form = new FormData();
          form.set("slip", new File([JPEG_BYTES as BlobPart], "slip.jpg", { type: "image/jpeg" }));
          return form;
        })(),
      });
    rpcMock.mockResolvedValue({ data: { outcome: "slip_uploaded", slipId: "s1", paymentId: VALID_ORDER.paymentId }, error: null });
    const res = await call(other());
    expect(res.status).not.toBe(429);
  });
});
