import { describe, expect, it } from "vitest";
import { buildSlipStoragePath } from "./storage-path";

describe("buildSlipStoragePath", () => {
  const ORDER_ID = "6da0566f-266f-4ae4-baa9-d08c18a254cd";

  it("scopes the path under the internal order id, never the tracking token or order number", () => {
    const path = buildSlipStoragePath(ORDER_ID, "image/jpeg");
    expect(path.startsWith(`orders/${ORDER_ID}/`)).toBe(true);
  });

  it("uses the correct extension per MIME type", () => {
    expect(buildSlipStoragePath(ORDER_ID, "image/jpeg").endsWith(".jpg")).toBe(true);
    expect(buildSlipStoragePath(ORDER_ID, "image/png").endsWith(".png")).toBe(true);
    expect(buildSlipStoragePath(ORDER_ID, "image/webp").endsWith(".webp")).toBe(true);
  });

  it("generates a fresh unpredictable path on every call (no filename reuse)", () => {
    const a = buildSlipStoragePath(ORDER_ID, "image/jpeg");
    const b = buildSlipStoragePath(ORDER_ID, "image/jpeg");
    expect(a).not.toBe(b);
  });
});
