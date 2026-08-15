import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * POST /api/cron/expire-reservations
 *
 * Runs the idempotent expire_stale_reservations() database function
 * (0007_reservation_expiration.sql). Intended to be called on a schedule
 * (Vercel Cron or equivalent) — NOT configured/deployed yet, this is just
 * the protected endpoint for it to hit later.
 *
 * Auth: a static bearer secret (CRON_SECRET), checked server-side only.
 * Fails CLOSED — if the secret isn't configured at all, every request is
 * rejected rather than the endpoint silently running unauthenticated.
 */
export async function POST(request: Request) {
  // Read directly rather than via getServerEnv(), which validates the
  // full server env bundle (SUPABASE_SERVICE_ROLE_KEY etc.) — this check
  // must depend on nothing but CRON_SECRET itself.
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    return unauthorized();
  }

  const authHeader = request.headers.get("authorization");
  const expected = `Bearer ${cronSecret}`;
  if (!authHeader || !timingSafeEqual(authHeader, expected)) {
    return unauthorized();
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return NextResponse.json({ error: "Service unavailable" }, { status: 503 });
  }

  const { data, error } = await admin.rpc("expire_stale_reservations");

  if (error) {
    console.error("[api/cron/expire-reservations] failed:", error);
    return NextResponse.json({ error: "Failed to process expirations" }, { status: 502 });
  }

  // expire_stale_reservations() returns a single-row table.
  const result = Array.isArray(data) ? data[0] : data;

  // Safe summary only — counts, never order numbers/customer data (§8).
  return NextResponse.json({
    ordersExpired: result?.orders_expired ?? 0,
    reservationsReleased: result?.reservations_released ?? 0,
  });
}

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

/** Constant-time string comparison to avoid leaking the secret via timing. */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
