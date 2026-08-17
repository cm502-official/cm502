/**
 * Centralized transfer-timestamp validation (§12) — the only place that
 * decides whether a slip's claimed transfer time is plausible. Nothing
 * else should independently compare `transferred_at` against order
 * timestamps.
 */
export interface TimestampCheckInput {
  transferredAt: string | null;
  orderCreatedAt: string;
  reservationExpiresAt: string | null;
  now?: number;
  /** Tolerance for clock skew between the bank, OCR provider, and our clock. */
  clockSkewMs?: number;
}

const DEFAULT_CLOCK_SKEW_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Returns:
 *   - null  → unknown (timestamp missing or unparseable) — NOT a rejection,
 *             just insufficient evidence; caller routes to needs_review.
 *   - false → definitely implausible (clearly before order creation,
 *             clearly after the payment window closed, or clearly in the
 *             future beyond reasonable clock skew) — a real rejection reason.
 *   - true  → plausible.
 */
export function isTransferTimeValid(input: TimestampCheckInput): boolean | null {
  if (!input.transferredAt) return null;

  const transferredAt = new Date(input.transferredAt).getTime();
  if (Number.isNaN(transferredAt)) return null;

  const createdAt = new Date(input.orderCreatedAt).getTime();
  if (Number.isNaN(createdAt)) return null;

  const skew = input.clockSkewMs ?? DEFAULT_CLOCK_SKEW_MS;
  const now = input.now ?? Date.now();

  if (transferredAt < createdAt - skew) return false;
  if (transferredAt > now + skew) return false;

  if (input.reservationExpiresAt) {
    const expiresAt = new Date(input.reservationExpiresAt).getTime();
    if (!Number.isNaN(expiresAt) && transferredAt > expiresAt + skew) return false;
  }

  return true;
}
