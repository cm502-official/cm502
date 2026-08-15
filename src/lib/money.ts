/**
 * Money handling for CM502.
 *
 * ALL money is stored and compared as integer satang (1 THB = 100 satang).
 * Never use floating point for money — floats cannot represent 0.10 THB
 * exactly, which is exactly the kind of off-by-one-satang bug that would
 * make a legitimate payment fail verification.
 */

const THB_TO_SATANG = 100;

/**
 * Parses a human/OCR-supplied amount string into integer satang.
 *
 * Accepts the formats OCR slips or admin input commonly produce:
 *   "790"            -> 79000
 *   "790.00"         -> 79000
 *   "฿790.00"        -> 79000
 *   "790.00 บาท"     -> 79000
 *   "1,290.50"       -> 129050
 *   "THB 790.00"     -> 79000
 *   "  790.5  "      -> 79050
 *
 * Returns null (never throws, never silently rounds a malformed value) if
 * the string doesn't resolve to a clean amount with at most 2 decimal
 * places. Callers must treat null as "could not parse" and route to manual
 * review rather than guessing.
 */
export function parseAmountToSatang(input: string): number | null {
  if (typeof input !== "string") return null;

  const normalized = input
    .trim()
    .replace(/บาท/gi, "")
    .replace(/thb/gi, "")
    .replace(/฿/g, "")
    .replace(/,/g, "")
    .trim();

  if (normalized === "") return null;

  // Reject anything with more than one number-like token stitched
  // together (e.g. "790.00 500.00") — ambiguous, must not guess.
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return null;

  const [wholePart, fractionPartRaw] = normalized.split(".");
  const fractionPart = (fractionPartRaw ?? "").padEnd(2, "0").slice(0, 2);

  const whole = Number.parseInt(wholePart, 10);
  const fraction = Number.parseInt(fractionPart, 10);

  if (!Number.isSafeInteger(whole) || !Number.isSafeInteger(fraction)) {
    return null;
  }

  return whole * THB_TO_SATANG + fraction;
}

/** Converts a known-good THB decimal number to integer satang. */
export function thbToSatang(thb: number): number {
  if (!Number.isFinite(thb)) {
    throw new RangeError(`thbToSatang: not a finite number (${thb})`);
  }
  // Round at the satang boundary to absorb float noise (e.g. 790.1 * 100
  // === 79009.999999999999 in IEEE754), never truncate.
  return Math.round(thb * THB_TO_SATANG);
}

/** Converts integer satang to a THB decimal number (for calculations only). */
export function satangToThb(satang: number): number {
  assertSatang(satang);
  return satang / THB_TO_SATANG;
}

/**
 * Formats integer satang as a THB display string with the mandatory
 * two-decimal-place / ฿ prefix format, e.g. 79000 -> "฿790.00".
 */
export function formatSatangAsThb(satang: number): string {
  assertSatang(satang);
  const negative = satang < 0;
  const abs = Math.abs(satang);
  const whole = Math.floor(abs / THB_TO_SATANG);
  const fraction = abs % THB_TO_SATANG;
  const wholeFormatted = whole.toLocaleString("en-US");
  return `${negative ? "-" : ""}฿${wholeFormatted}.${fraction.toString().padStart(2, "0")}`;
}

/** Strict integer-satang equality — the only correct way to compare money. */
export function satangEquals(a: number, b: number): boolean {
  assertSatang(a);
  assertSatang(b);
  return a === b;
}

export function addSatang(...values: number[]): number {
  return values.reduce((sum, v) => {
    assertSatang(v);
    return sum + v;
  }, 0);
}

function assertSatang(value: number): void {
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `Expected integer satang, got ${value}. Money must never be a float.`,
    );
  }
}
