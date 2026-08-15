import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.fn();
const createAdminClientMock = vi.fn(() => ({ rpc: rpcMock }));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => createAdminClientMock(),
}));

const { POST } = await import("./route");

function makeRequest(headers: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/cron/expire-reservations", {
    method: "POST",
    headers,
  });
}

const ORIGINAL_CRON_SECRET = process.env.CRON_SECRET;

beforeEach(() => {
  rpcMock.mockReset();
  createAdminClientMock.mockClear();
  createAdminClientMock.mockImplementation(() => ({ rpc: rpcMock }));
});

afterEach(() => {
  if (ORIGINAL_CRON_SECRET === undefined) {
    delete process.env.CRON_SECRET;
  } else {
    process.env.CRON_SECRET = ORIGINAL_CRON_SECRET;
  }
});

describe("POST /api/cron/expire-reservations — auth", () => {
  it("rejects when CRON_SECRET is not configured at all (fail closed)", async () => {
    delete process.env.CRON_SECRET;
    const res = await POST(makeRequest({ authorization: "Bearer anything" }));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects a missing Authorization header", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    const res = await POST(makeRequest());
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects an incorrect secret", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    const res = await POST(makeRequest({ authorization: "Bearer wrong-secret" }));
    expect(res.status).toBe(401);
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("accepts the correct secret and runs the expiration function", async () => {
    process.env.CRON_SECRET = "test-secret-value";
    rpcMock.mockResolvedValue({ data: [{ orders_expired: 2, reservations_released: 3 }], error: null });

    const res = await POST(makeRequest({ authorization: "Bearer test-secret-value" }));
    expect(res.status).toBe(200);
    expect(rpcMock).toHaveBeenCalledWith("expire_stale_reservations");
  });
});

describe("POST /api/cron/expire-reservations — response shape", () => {
  beforeEach(() => {
    process.env.CRON_SECRET = "test-secret-value";
  });

  it("returns only a safe numeric summary, no PII / order data", async () => {
    rpcMock.mockResolvedValue({ data: [{ orders_expired: 5, reservations_released: 7 }], error: null });
    const res = await POST(makeRequest({ authorization: "Bearer test-secret-value" }));
    const body = await res.json();

    expect(body).toEqual({ ordersExpired: 5, reservationsReleased: 7 });
    expect(JSON.stringify(body)).not.toMatch(/order_number|CM502-|phone|email|address/i);
  });

  it("handles a zero-result run cleanly", async () => {
    rpcMock.mockResolvedValue({ data: [{ orders_expired: 0, reservations_released: 0 }], error: null });
    const res = await POST(makeRequest({ authorization: "Bearer test-secret-value" }));
    const body = await res.json();
    expect(body).toEqual({ ordersExpired: 0, reservationsReleased: 0 });
  });

  it("never fakes success when the database call fails", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "connection refused", code: "XX000" } });
    const res = await POST(makeRequest({ authorization: "Bearer test-secret-value" }));
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/connection refused/);
  });

  it("returns 503 (not a fake success) when the database is unreachable", async () => {
    createAdminClientMock.mockImplementationOnce(() => {
      throw new Error("ECONNREFUSED");
    });
    const res = await POST(makeRequest({ authorization: "Bearer test-secret-value" }));
    expect(res.status).toBe(503);
  });
});
