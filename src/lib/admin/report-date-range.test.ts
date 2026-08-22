import { describe, expect, it } from "vitest";
import {
  resolveReportDateRange,
  isWithinRange,
  pickBucketGranularity,
  bucketKeyForTimestamp,
  formatBangkokYmd,
  parseReportDateRangeSearchParams,
} from "./report-date-range";

// A fixed "now" for deterministic tests: 2026-08-22 03:00 UTC = 2026-08-22 10:00 Bangkok.
const NOW = new Date("2026-08-22T03:00:00.000Z");

describe("resolveReportDateRange — today", () => {
  it("spans exactly the Bangkok calendar day, not the UTC day", () => {
    const range = resolveReportDateRange({ preset: "today" }, NOW);
    // Bangkok midnight of 2026-08-22 = 2026-08-21T17:00:00Z (UTC+7).
    expect(range.startIso).toBe("2026-08-21T17:00:00.000Z");
    expect(range.endIso).toBe("2026-08-22T17:00:00.000Z");
  });

  it("includes a timestamp from early Bangkok morning that is still 'yesterday' in UTC", () => {
    const range = resolveReportDateRange({ preset: "today" }, NOW);
    // 2026-08-22T01:00:00Z = 2026-08-22T08:00 Bangkok — same Bangkok day as NOW.
    expect(isWithinRange("2026-08-22T01:00:00.000Z", range)).toBe(true);
    // 2026-08-21T20:00:00Z = 2026-08-22T03:00 Bangkok — also today in Bangkok, even though the UTC date is the 21st.
    expect(isWithinRange("2026-08-21T20:00:00.000Z", range)).toBe(true);
    // 2026-08-21T16:00:00Z = 2026-08-21T23:00 Bangkok — yesterday in Bangkok.
    expect(isWithinRange("2026-08-21T16:00:00.000Z", range)).toBe(false);
  });
});

describe("resolveReportDateRange — last7 / last30", () => {
  it("last7 includes today and the preceding 6 Bangkok days (7 days total)", () => {
    const range = resolveReportDateRange({ preset: "last7" }, NOW);
    expect(range.startIso).toBe("2026-08-15T17:00:00.000Z"); // Bangkok midnight of Aug 16
    expect(range.endIso).toBe("2026-08-22T17:00:00.000Z");
  });

  it("last30 includes today and the preceding 29 Bangkok days", () => {
    const range = resolveReportDateRange({ preset: "last30" }, NOW);
    expect(range.startIso).toBe("2026-07-23T17:00:00.000Z"); // Bangkok midnight of Jul 24
    expect(range.endIso).toBe("2026-08-22T17:00:00.000Z");
  });
});

describe("resolveReportDateRange — this_month", () => {
  it("spans from the 1st of the Bangkok-local month through today", () => {
    const range = resolveReportDateRange({ preset: "this_month" }, NOW);
    expect(range.startIso).toBe("2026-07-31T17:00:00.000Z"); // Bangkok midnight of Aug 1
    expect(range.endIso).toBe("2026-08-22T17:00:00.000Z");
  });
});

describe("resolveReportDateRange — all_time", () => {
  it("has no bounds", () => {
    const range = resolveReportDateRange({ preset: "all_time" }, NOW);
    expect(range.startIso).toBeNull();
    expect(range.endIso).toBeNull();
    expect(isWithinRange("2019-01-01T00:00:00.000Z", range)).toBe(true);
    expect(isWithinRange("2099-01-01T00:00:00.000Z", range)).toBe(true);
  });
});

describe("resolveReportDateRange — custom", () => {
  it("spans the given Bangkok-local start/end days inclusive", () => {
    const range = resolveReportDateRange({ preset: "custom", startDate: "2026-08-01", endDate: "2026-08-05" }, NOW);
    expect(range.startIso).toBe("2026-07-31T17:00:00.000Z");
    expect(range.endIso).toBe("2026-08-05T17:00:00.000Z");
    expect(isWithinRange("2026-08-05T16:59:59.000Z", range)).toBe(true); // still Aug 5 Bangkok
    expect(isWithinRange("2026-08-05T17:00:01.000Z", range)).toBe(false); // now Aug 6 Bangkok
  });

  it("falls back to This Month when start is after end", () => {
    const custom = resolveReportDateRange({ preset: "custom", startDate: "2026-08-10", endDate: "2026-08-01" }, NOW);
    const thisMonth = resolveReportDateRange({ preset: "this_month" }, NOW);
    expect(custom.startIso).toBe(thisMonth.startIso);
    expect(custom.endIso).toBe(thisMonth.endIso);
    expect(custom.preset).toBe("this_month");
  });

  it("falls back to This Month when dates are missing or malformed", () => {
    expect(resolveReportDateRange({ preset: "custom" }, NOW).preset).toBe("this_month");
    expect(resolveReportDateRange({ preset: "custom", startDate: "not-a-date", endDate: "2026-08-05" }, NOW).preset).toBe(
      "this_month",
    );
  });
});

describe("pickBucketGranularity", () => {
  it("stays daily for ranges of 60 days or less", () => {
    expect(pickBucketGranularity("2026-08-01T00:00:00Z", "2026-08-31T00:00:00Z")).toBe("day");
  });

  it("switches to weekly past 60 days", () => {
    expect(pickBucketGranularity("2026-01-01T00:00:00Z", "2026-12-31T00:00:00Z")).toBe("week");
  });
});

describe("bucketKeyForTimestamp", () => {
  it("day granularity keys by the Bangkok-local calendar day", () => {
    expect(bucketKeyForTimestamp("2026-08-21T20:00:00.000Z", "day")).toBe("2026-08-22"); // 03:00 Bangkok next day
  });

  it("week granularity keys by the Bangkok-local Monday of that week", () => {
    // 2026-08-22 is a Saturday.
    expect(bucketKeyForTimestamp("2026-08-22T10:00:00.000Z", "week")).toBe("2026-08-17"); // the preceding Monday
  });
});

describe("formatBangkokYmd", () => {
  it("formats a UTC instant as its Bangkok-local date", () => {
    expect(formatBangkokYmd(new Date("2026-08-21T20:00:00.000Z"))).toBe("2026-08-22");
  });
});

describe("parseReportDateRangeSearchParams", () => {
  it("reads a valid preset and custom dates", () => {
    expect(parseReportDateRangeSearchParams({ range: "last7" })).toEqual({ preset: "last7", startDate: null, endDate: null });
    expect(parseReportDateRangeSearchParams({ range: "custom", start: "2026-08-01", end: "2026-08-05" })).toEqual({
      preset: "custom",
      startDate: "2026-08-01",
      endDate: "2026-08-05",
    });
  });

  it("falls back to the default preset for a missing or invalid range param", () => {
    expect(parseReportDateRangeSearchParams({})).toEqual({ preset: "this_month", startDate: null, endDate: null });
    expect(parseReportDateRangeSearchParams({ range: "not-a-real-preset" })).toEqual({
      preset: "this_month",
      startDate: null,
      endDate: null,
    });
  });

  it("takes the first value when Next.js hands back an array (repeated query param)", () => {
    expect(parseReportDateRangeSearchParams({ range: ["today", "last7"] })).toEqual({
      preset: "today",
      startDate: null,
      endDate: null,
    });
  });
});
