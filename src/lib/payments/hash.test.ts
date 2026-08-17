import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  it("produces the correct known SHA-256 for an empty input", () => {
    expect(sha256Hex(new Uint8Array())).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("is deterministic for the same bytes", () => {
    const bytes = new TextEncoder().encode("same slip image bytes");
    expect(sha256Hex(bytes)).toBe(sha256Hex(bytes));
  });

  it("differs for different bytes", () => {
    const a = new TextEncoder().encode("slip A");
    const b = new TextEncoder().encode("slip B");
    expect(sha256Hex(a)).not.toBe(sha256Hex(b));
  });
});
