import { describe, expect, it } from "vitest";
import {
  addSatang,
  formatSatangAsThb,
  parseAmountToSatang,
  satangEquals,
  satangToThb,
  thbToSatang,
} from "./money";

describe("parseAmountToSatang", () => {
  it("parses a bare integer", () => {
    expect(parseAmountToSatang("790")).toBe(79000);
  });

  it("parses a plain decimal", () => {
    expect(parseAmountToSatang("790.00")).toBe(79000);
  });

  it("parses a baht-sign-prefixed amount", () => {
    expect(parseAmountToSatang("฿790.00")).toBe(79000);
  });

  it("parses a Thai-suffixed amount", () => {
    expect(parseAmountToSatang("790.00 บาท")).toBe(79000);
  });

  it("parses a thousands-separated amount", () => {
    expect(parseAmountToSatang("1,290.50")).toBe(129050);
  });

  it("parses a THB-prefixed amount", () => {
    expect(parseAmountToSatang("THB 790.00")).toBe(79000);
  });

  it("parses a single-decimal amount by padding", () => {
    expect(parseAmountToSatang("790.5")).toBe(79050);
  });

  it("handles surrounding whitespace", () => {
    expect(parseAmountToSatang("  790.00  ")).toBe(79000);
  });

  it("returns null for missing/empty input", () => {
    expect(parseAmountToSatang("")).toBeNull();
    expect(parseAmountToSatang("   ")).toBeNull();
  });

  it("returns null for malformed amounts", () => {
    expect(parseAmountToSatang("not a number")).toBeNull();
    expect(parseAmountToSatang("790.")).toBeNull();
    expect(parseAmountToSatang("790.123")).toBeNull();
  });

  it("returns null when multiple numbers are present (ambiguous)", () => {
    expect(parseAmountToSatang("790.00 500.00")).toBeNull();
  });
});

describe("thbToSatang / satangToThb", () => {
  it("converts THB decimal to satang", () => {
    expect(thbToSatang(790)).toBe(79000);
    expect(thbToSatang(790.0)).toBe(79000);
    expect(thbToSatang(1290.5)).toBe(129050);
  });

  it("round-trips through satangToThb", () => {
    expect(satangToThb(79000)).toBe(790);
    expect(satangToThb(129050)).toBe(1290.5);
  });

  it("absorbs IEEE754 float noise by rounding", () => {
    // 790.1 * 100 is 79009.999999999999 in raw float math.
    expect(thbToSatang(790.1)).toBe(79010);
  });
});

describe("formatSatangAsThb", () => {
  it("formats with exactly two decimal places", () => {
    expect(formatSatangAsThb(79000)).toBe("฿790.00");
    expect(formatSatangAsThb(59000)).toBe("฿590.00");
  });

  it("formats sub-100-satang amounts with a leading zero", () => {
    expect(formatSatangAsThb(5)).toBe("฿0.05");
  });

  it("adds thousands separators", () => {
    expect(formatSatangAsThb(129050)).toBe("฿1,290.50");
  });

  it("formats negative amounts", () => {
    expect(formatSatangAsThb(-79000)).toBe("-฿790.00");
  });
});

describe("satangEquals — the amount-verification comparison", () => {
  it("790.00 satang equals 790.00 satang", () => {
    expect(satangEquals(thbToSatang(790), parseAmountToSatang("790.00")!)).toBe(true);
  });

  it("790.01 does not equal 790.00", () => {
    expect(satangEquals(thbToSatang(790.01), thbToSatang(790.0))).toBe(false);
  });

  it("rejects comparing a non-integer", () => {
    expect(() => satangEquals(790.5, 79000)).toThrow(TypeError);
  });
});

describe("addSatang", () => {
  it("sums subtotal + shipping without float drift", () => {
    const subtotal = thbToSatang(790);
    const shipping = thbToSatang(50);
    expect(addSatang(subtotal, shipping)).toBe(84000);
  });
});
