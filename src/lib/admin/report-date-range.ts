/**
 * Date-range resolution for /admin/report (§2). Pure — no Supabase, no
 * Next.js APIs — so it's trivially unit-testable and reused identically
 * by the page (server-side filtering) and any future export tooling.
 *
 * Deliberately computed in Thailand's calendar day (Asia/Bangkok, a
 * fixed UTC+7 offset — Thailand has no DST, so no timezone-database
 * dependency is needed). "Today"/"This Month" for a Thai admin must mean
 * the Thai calendar day, not the server's UTC day (Vercel functions run
 * in UTC) — otherwise "Today" could start showing tomorrow's Bangkok
 * orders, or miss the first 7 hours of today's.
 */

const BANGKOK_OFFSET_MS = 7 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

export type ReportDatePreset = "today" | "last7" | "last30" | "this_month" | "all_time" | "custom";

export const REPORT_DATE_PRESETS: ReportDatePreset[] = [
  "today",
  "last7",
  "last30",
  "this_month",
  "all_time",
  "custom",
];

export const REPORT_DATE_PRESET_LABELS: Record<ReportDatePreset, string> = {
  today: "Today",
  last7: "Last 7 Days",
  last30: "Last 30 Days",
  this_month: "This Month",
  all_time: "All Time",
  custom: "Custom",
};

export const DEFAULT_REPORT_PRESET: ReportDatePreset = "this_month";

export interface ReportDateRangeInput {
  preset: ReportDatePreset;
  /** yyyy-mm-dd — only meaningful when preset === "custom". */
  startDate?: string | null;
  endDate?: string | null;
}

export interface ResolvedReportRange {
  preset: ReportDatePreset;
  /** Inclusive lower bound (ISO instant), or null = unbounded (All Time). */
  startIso: string | null;
  /** Exclusive upper bound (ISO instant), or null = unbounded. */
  endIso: string | null;
  label: string;
  /** Only set for preset === "custom" — echoes back the resolved input dates for the date pickers. */
  startDate: string | null;
  endDate: string | null;
}

function bangkokDayStart(date: Date): Date {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  return new Date(Date.UTC(y, m, d, 0, 0, 0, 0) - BANGKOK_OFFSET_MS);
}

function bangkokMonthStart(date: Date): Date {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  return new Date(Date.UTC(y, m, 1, 0, 0, 0, 0) - BANGKOK_OFFSET_MS);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY_MS);
}

/** yyyy-mm-dd string, interpreted as midnight of that day in Bangkok time (no timezone suffix — deliberately naive). */
function parseYmd(value: string | null | undefined): Date | null {
  if (!value) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, m, d] = match;
  const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

/** Formats a Date as its Bangkok-local yyyy-mm-dd (for bucket keys and echoing custom range dates back to the UI). */
export function formatBangkokYmd(date: Date): string {
  const shifted = new Date(date.getTime() + BANGKOK_OFFSET_MS);
  const y = shifted.getUTCFullYear();
  const m = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const d = String(shifted.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Resolves a preset/custom selection into concrete UTC instant bounds.
 * Falls back to the documented default (This Month, §2) for a missing or
 * invalid custom range (start after end, unparseable dates) rather than
 * silently showing an empty or wrong period.
 */
export function resolveReportDateRange(input: ReportDateRangeInput, now: Date = new Date()): ResolvedReportRange {
  switch (input.preset) {
    case "today": {
      const start = bangkokDayStart(now);
      const end = addDays(start, 1);
      return {
        preset: "today",
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: REPORT_DATE_PRESET_LABELS.today,
        startDate: null,
        endDate: null,
      };
    }
    case "last7": {
      const todayStart = bangkokDayStart(now);
      const start = addDays(todayStart, -6);
      const end = addDays(todayStart, 1);
      return {
        preset: "last7",
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: REPORT_DATE_PRESET_LABELS.last7,
        startDate: null,
        endDate: null,
      };
    }
    case "last30": {
      const todayStart = bangkokDayStart(now);
      const start = addDays(todayStart, -29);
      const end = addDays(todayStart, 1);
      return {
        preset: "last30",
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: REPORT_DATE_PRESET_LABELS.last30,
        startDate: null,
        endDate: null,
      };
    }
    case "this_month": {
      const start = bangkokMonthStart(now);
      const end = addDays(bangkokDayStart(now), 1);
      return {
        preset: "this_month",
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: REPORT_DATE_PRESET_LABELS.this_month,
        startDate: null,
        endDate: null,
      };
    }
    case "all_time":
      return {
        preset: "all_time",
        startIso: null,
        endIso: null,
        label: REPORT_DATE_PRESET_LABELS.all_time,
        startDate: null,
        endDate: null,
      };
    case "custom": {
      const parsedStart = parseYmd(input.startDate);
      const parsedEnd = parseYmd(input.endDate);
      if (!parsedStart || !parsedEnd || parsedStart.getTime() > parsedEnd.getTime()) {
        return resolveReportDateRange({ preset: DEFAULT_REPORT_PRESET }, now);
      }
      const start = bangkokDayStart(parsedStart);
      const end = addDays(bangkokDayStart(parsedEnd), 1);
      return {
        preset: "custom",
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        label: `${input.startDate} – ${input.endDate}`,
        startDate: input.startDate ?? null,
        endDate: input.endDate ?? null,
      };
    }
    default:
      return resolveReportDateRange({ preset: DEFAULT_REPORT_PRESET }, now);
  }
}

/** True if `isoTimestamp` falls within [startIso, endIso) — either bound may be null (unbounded). */
export function isWithinRange(isoTimestamp: string, range: Pick<ResolvedReportRange, "startIso" | "endIso">): boolean {
  const t = new Date(isoTimestamp).getTime();
  if (Number.isNaN(t)) return false;
  if (range.startIso !== null && t < new Date(range.startIso).getTime()) return false;
  if (range.endIso !== null && t >= new Date(range.endIso).getTime()) return false;
  return true;
}

export type ReportBucketGranularity = "day" | "week";

/** Long ranges (§4 "aggregate ให้เหมาะสม") switch to weekly buckets past 60 days so the chart stays readable; shorter ranges stay daily for precision. */
export function pickBucketGranularity(startIso: string, endIso: string): ReportBucketGranularity {
  const spanDays = (new Date(endIso).getTime() - new Date(startIso).getTime()) / DAY_MS;
  return spanDays > 60 ? "week" : "day";
}

/** Bucket key for one timestamp — a Bangkok-local day, or (for "week") the Bangkok-local Monday that day falls in. */
export function bucketKeyForTimestamp(isoTimestamp: string, granularity: ReportBucketGranularity): string {
  const dayStart = bangkokDayStart(new Date(isoTimestamp));
  if (granularity === "day") return formatBangkokYmd(dayStart);

  const shifted = new Date(dayStart.getTime() + BANGKOK_OFFSET_MS);
  const dow = shifted.getUTCDay(); // 0 = Sunday .. 6 = Saturday
  const daysSinceMonday = dow === 0 ? 6 : dow - 1;
  const weekStart = addDays(dayStart, -daysSinceMonday);
  return formatBangkokYmd(weekStart);
}

/** yyyy-mm-dd input validity check — used to reject a malformed custom-range query param before it reaches resolveReportDateRange's fallback. */
export function isValidYmd(value: string | null | undefined): boolean {
  return parseYmd(value) !== null;
}

/** Reads ?range=&start=&end= from the page's searchParams into a ReportDateRangeInput — an unrecognized/missing preset falls back to the default (This Month) rather than erroring. */
export function parseReportDateRangeSearchParams(
  searchParams: Record<string, string | string[] | undefined>,
): ReportDateRangeInput {
  const firstValue = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);
  const presetRaw = firstValue(searchParams.range);
  const preset = REPORT_DATE_PRESETS.includes(presetRaw as ReportDatePreset) ? (presetRaw as ReportDatePreset) : DEFAULT_REPORT_PRESET;
  return {
    preset,
    startDate: firstValue(searchParams.start) ?? null,
    endDate: firstValue(searchParams.end) ?? null,
  };
}
