import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveOrderMock = vi.fn();
const uploadMock = vi.fn();
const attemptCountMock = vi.fn();
const upsertMock = vi.fn();

vi.mock("@/lib/shipping-proofs/resolve-order-for-proof-upload", () => ({
  resolveOrderForProofUpload: (...args: unknown[]) => resolveOrderMock(...args),
}));

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    storage: { from: () => ({ upload: uploadMock }) },
    from: () => ({
      select: () => ({ eq: () => attemptCountMock() }),
      upsert: (...args: unknown[]) => upsertMock(...args),
    }),
  }),
}));

const { POST } = await import("./route");
const { __resetRateLimitForTests } = await import("@/lib/rate-limit");

const TOKEN = "a".repeat(32);
const WEBP_BYTES = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3, 4]);

const FREE_SHIPPING_ORDER = {
  id: "6da0566f-266f-4ae4-baa9-d08c18a254cd",
  orderNumber: "CM502-20260818-0001",
  shippingChoice: "free_social_proof",
  existingProofTypes: [],
};

const PAID_SHIPPING_ORDER = {
  ...FREE_SHIPPING_ORDER,
  shippingChoice: "paid_shipping",
};

function makeRequest(opts: { bytes?: Uint8Array; proofType?: string; omitFile?: boolean } = {}): Request {
  const { bytes = WEBP_BYTES, proofType = "instagram_follow", omitFile = false } = opts;
  const form = new FormData();
  form.set("proofType", proofType);
  if (!omitFile) {
    form.set("file", new File([bytes as BlobPart], "proof.webp", { type: "image/webp" }));
  }
  return new Request(`http://localhost/api/orders/${TOKEN}/shipping-proofs`, { method: "POST", body: form });
}

function call(request: Request, token = TOKEN) {
  return POST(request, { params: Promise.resolve({ token }) });
}

beforeEach(() => {
  resolveOrderMock.mockReset();
  uploadMock.mockReset();
  attemptCountMock.mockReset();
  upsertMock.mockReset();
  attemptCountMock.mockResolvedValue({ count: 0 });
  uploadMock.mockResolvedValue({ error: null });
  upsertMock.mockResolvedValue({ error: null });
  __resetRateLimitForTests();
});

describe("POST /api/orders/[token]/shipping-proofs — eligibility", () => {
  it("rejects an unknown/invalid tracking token", async () => {
    resolveOrderMock.mockResolvedValue(null);
    const res = await call(makeRequest());
    expect(res.status).toBe(404);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects an order that did not choose free_social_proof", async () => {
    resolveOrderMock.mockResolvedValue(PAID_SHIPPING_ORDER);
    const res = await call(makeRequest());
    expect(res.status).toBe(409);
    const body = await res.json();
    expect(body.error.code).toBe("NOT_ELIGIBLE");
    expect(uploadMock).not.toHaveBeenCalled();
  });
});

describe("POST /api/orders/[token]/shipping-proofs — validation", () => {
  beforeEach(() => resolveOrderMock.mockResolvedValue(FREE_SHIPPING_ORDER));

  it("rejects a missing file", async () => {
    const res = await call(makeRequest({ omitFile: true }));
    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects an unknown proof type", async () => {
    const res = await call(makeRequest({ proofType: "instagram_comment" }));
    expect(res.status).toBe(400);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("rejects an empty file", async () => {
    const res = await call(makeRequest({ bytes: new Uint8Array() }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("EMPTY_FILE");
  });

  it("rejects a non-image byte stream even with a spoofed image MIME/extension", async () => {
    const html = new TextEncoder().encode("<html>not an image</html>");
    const res = await call(makeRequest({ bytes: html }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("UNSUPPORTED_FORMAT");
  });

  it("rejects a file over the 1 MB compressed-output cap", async () => {
    const big = new Uint8Array(1024 * 1024 + 1);
    big.set(WEBP_BYTES);
    const res = await call(makeRequest({ bytes: big }));
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error.code).toBe("FILE_TOO_LARGE");
  });
});

describe("POST /api/orders/[token]/shipping-proofs — success", () => {
  beforeEach(() => resolveOrderMock.mockResolvedValue(FREE_SHIPPING_ORDER));

  it("stores the proof and reports progress toward 7/7", async () => {
    const res = await call(makeRequest({ proofType: "instagram_follow" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({
      proofType: "instagram_follow",
      uploaded: true,
      completedCount: 1,
      requiredCount: 7,
      allComplete: false,
    });
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(upsertMock).toHaveBeenCalledTimes(1);
  });

  it("uploads to the documented deterministic storage path", async () => {
    await call(makeRequest({ proofType: "tiktok_comment" }));
    const [path] = uploadMock.mock.calls[0] as [string, Uint8Array, unknown];
    expect(path).toBe(`orders/${FREE_SHIPPING_ORDER.id}/tiktok/comment.webp`);
  });

  it("reports allComplete: true once the 7th distinct category is uploaded", async () => {
    resolveOrderMock.mockResolvedValue({
      ...FREE_SHIPPING_ORDER,
      existingProofTypes: [
        "instagram_follow",
        "instagram_like",
        "instagram_story_share",
        "tiktok_follow",
        "tiktok_like",
        "tiktok_repost",
      ],
    });
    const res = await call(makeRequest({ proofType: "tiktok_comment" }));
    const body = await res.json();
    expect(body.completedCount).toBe(7);
    expect(body.allComplete).toBe(true);
  });

  it("re-uploading the same category replaces it rather than double-counting", async () => {
    resolveOrderMock.mockResolvedValue({
      ...FREE_SHIPPING_ORDER,
      existingProofTypes: ["instagram_follow"],
    });
    const res = await call(makeRequest({ proofType: "instagram_follow" }));
    const body = await res.json();
    expect(body.completedCount).toBe(1);
  });
});

describe("POST /api/orders/[token]/shipping-proofs — failure handling", () => {
  beforeEach(() => resolveOrderMock.mockResolvedValue(FREE_SHIPPING_ORDER));

  it("returns a service-unavailable error if storage upload fails, without recording a DB row", async () => {
    uploadMock.mockResolvedValue({ error: { message: "network error" } });
    const res = await call(makeRequest());
    expect(res.status).toBe(503);
    expect(upsertMock).not.toHaveBeenCalled();
  });

  it("returns an upload-failed error if the DB record fails after a successful storage upload", async () => {
    upsertMock.mockResolvedValue({ error: { message: "constraint violation" } });
    const res = await call(makeRequest());
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("UPLOAD_FAILED");
  });
});
