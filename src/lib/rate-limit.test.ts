import { beforeEach, describe, expect, it } from "vitest";
import { __resetRateLimitForTests, checkRateLimit, getClientIpKey } from "./rate-limit";

beforeEach(() => {
  __resetRateLimitForTests();
});

describe("checkRateLimit", () => {
  it("allows requests up to the limit", () => {
    const now = 1_000_000;
    expect(checkRateLimit("key-a", 3, 60_000, now).allowed).toBe(true);
    expect(checkRateLimit("key-a", 3, 60_000, now).allowed).toBe(true);
    expect(checkRateLimit("key-a", 3, 60_000, now).allowed).toBe(true);
  });

  it("blocks once the limit is exceeded within the window", () => {
    const now = 1_000_000;
    checkRateLimit("key-b", 2, 60_000, now);
    checkRateLimit("key-b", 2, 60_000, now);
    const result = checkRateLimit("key-b", 2, 60_000, now);
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it("resets after the window passes", () => {
    const now = 1_000_000;
    checkRateLimit("key-c", 1, 1000, now);
    expect(checkRateLimit("key-c", 1, 1000, now).allowed).toBe(false);
    expect(checkRateLimit("key-c", 1, 1000, now + 1001).allowed).toBe(true);
  });

  it("tracks distinct keys independently", () => {
    const now = 1_000_000;
    checkRateLimit("key-d1", 1, 60_000, now);
    expect(checkRateLimit("key-d1", 1, 60_000, now).allowed).toBe(false);
    expect(checkRateLimit("key-d2", 1, 60_000, now).allowed).toBe(true);
  });
});

describe("getClientIpKey", () => {
  it("prefers x-forwarded-for, using only the first hop", () => {
    const req = new Request("http://localhost/", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(getClientIpKey(req)).toBe("1.2.3.4");
  });

  it("falls back to x-real-ip", () => {
    const req = new Request("http://localhost/", { headers: { "x-real-ip": "9.9.9.9" } });
    expect(getClientIpKey(req)).toBe("9.9.9.9");
  });

  it("falls back to a constant key when no proxy header is present", () => {
    const req = new Request("http://localhost/");
    expect(getClientIpKey(req)).toBe("unknown");
  });
});
