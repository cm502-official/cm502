import "server-only";

/**
 * Minimal fixed-window rate limiter (§30 — repeated-upload / token
 * brute-force protection for POST /api/orders/[token]/payment-slip,
 * independent of the existing per-order attempt cap in
 * payment-slip/route.ts which only fires once an order is already
 * known-valid).
 *
 * PRODUCTION CAVEAT: this is in-memory and per-process. On a serverless
 * or multi-instance deployment (e.g. Vercel), each instance has its own
 * counters, so this only bounds abuse *per instance* — a distributed
 * attacker spread across enough concurrent invocations can exceed the
 * intended limit. That's an acceptable fail-safe floor for Phase 4B (it
 * still meaningfully slows a single-source script), but real production
 * hardening needs a shared store (Upstash Redis, Vercel KV, or
 * equivalent) behind this same `checkRateLimit` signature — swapping the
 * implementation later doesn't require touching any call site.
 */

interface Bucket {
  count: number;
  resetAt: number;
}

const buckets = new Map<string, Bucket>();

// Bound memory growth: sweep expired buckets periodically rather than on
// every call.
let lastSweep = Date.now();
const SWEEP_INTERVAL_MS = 60_000;

function sweepExpired(now: number): void {
  if (now - lastSweep < SWEEP_INTERVAL_MS) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number, now: number = Date.now()): RateLimitResult {
  sweepExpired(now);

  const existing = buckets.get(key);
  if (!existing || existing.resetAt <= now) {
    const resetAt = now + windowMs;
    buckets.set(key, { count: 1, resetAt });
    return { allowed: true, remaining: limit - 1, resetAt };
  }

  if (existing.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: existing.resetAt };
  }

  existing.count += 1;
  return { allowed: true, remaining: limit - existing.count, resetAt: existing.resetAt };
}

/** Exposed for tests only. */
export function __resetRateLimitForTests(): void {
  buckets.clear();
}

/**
 * Best-effort client IP extraction from standard proxy headers. Falls
 * back to a constant key (effectively a global limit) when nothing is
 * present, e.g. local dev — never throws, never blocks the request on
 * its own.
 */
export function getClientIpKey(request: Request): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0].trim();
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}
