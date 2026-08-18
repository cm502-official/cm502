import { beforeEach, describe, expect, it, vi } from "vitest";

const getAdminUserMock = vi.fn();
const maybeSingleMock = vi.fn();
const eqMock = vi.fn();
const selectMock = vi.fn();
const updateMock = vi.fn();

vi.mock("@/lib/admin/require-admin", () => ({
  getAdminUserOrNull: () => getAdminUserMock(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from: () => ({
      update: (...args: unknown[]) => {
        updateMock(...args);
        return { eq: eqMock };
      },
    }),
  })),
}));

const { POST } = await import("./route");

const eqMock2 = vi.fn();

function makeRequest(body: unknown): Request {
  return new Request("http://localhost/api/admin/orders/CM502-1/proof-review", {
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
  eqMock.mockReset();
  eqMock2.mockReset();
  selectMock.mockReset();
  maybeSingleMock.mockReset();
  updateMock.mockReset();

  eqMock.mockReturnValue({ eq: eqMock2 });
  eqMock2.mockReturnValue({ select: selectMock });
  selectMock.mockReturnValue({ maybeSingle: maybeSingleMock });
  maybeSingleMock.mockResolvedValue({
    data: { order_number: "CM502-20260818-0001", proof_review_status: "approved" },
    error: null,
  });
});

describe("POST /api/admin/orders/[orderNumber]/proof-review — authorization", () => {
  it("rejects an unauthenticated/non-admin caller", async () => {
    getAdminUserMock.mockResolvedValue(null);
    const res = await call(makeRequest({ decision: "approved" }));
    expect(res.status).toBe(401);
  });
});

describe("POST /api/admin/orders/[orderNumber]/proof-review — validation", () => {
  beforeEach(() => getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" }));

  it("rejects malformed JSON", async () => {
    const res = await call(makeRequest("{not json"));
    expect(res.status).toBe(400);
  });

  it("rejects an invalid decision value", async () => {
    const res = await call(makeRequest({ decision: "maybe" }));
    expect(res.status).toBe(400);
  });

  it("rejects a missing decision", async () => {
    const res = await call(makeRequest({}));
    expect(res.status).toBe(400);
  });
});

describe("POST /api/admin/orders/[orderNumber]/proof-review — success", () => {
  beforeEach(() => getAdminUserMock.mockResolvedValue({ id: "admin-1", fullName: "Admin", role: "admin" }));

  it("approves and records the reviewing admin", async () => {
    const res = await call(makeRequest({ decision: "approved" }));
    expect(res.status).toBe(200);
    const [update] = updateMock.mock.calls[0] as [Record<string, unknown>];
    expect(update.proof_review_status).toBe("approved");
    expect(update.proof_reviewed_by).toBe("admin-1");
    expect(update.proof_review_reason).toBeNull();
  });

  it("rejects with an optional reason recorded", async () => {
    maybeSingleMock.mockResolvedValue({
      data: { order_number: "CM502-20260818-0001", proof_review_status: "rejected" },
      error: null,
    });
    const res = await call(makeRequest({ decision: "rejected", reason: "รูปไม่ชัดเจน" }));
    expect(res.status).toBe(200);
    const [update] = updateMock.mock.calls[0] as [Record<string, unknown>];
    expect(update.proof_review_status).toBe("rejected");
    expect(update.proof_review_reason).toBe("รูปไม่ชัดเจน");
  });

  it("only ever targets free_social_proof orders", async () => {
    await call(makeRequest({ decision: "approved" }));
    expect(eqMock2).toHaveBeenCalledWith("shipping_choice", "free_social_proof");
  });

  it("returns 404 when the order doesn't exist or isn't a free-shipping order", async () => {
    maybeSingleMock.mockResolvedValue({ data: null, error: null });
    const res = await call(makeRequest({ decision: "approved" }));
    expect(res.status).toBe(404);
  });
});
