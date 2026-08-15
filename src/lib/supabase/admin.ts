import "server-only";

/**
 * Privileged Supabase client using the SERVICE ROLE key — bypasses RLS
 * entirely. Import this ONLY inside:
 *   - route handlers that perform admin-authorized writes (order creation,
 *     stock mutation, payment verification), after re-checking auth/role
 *   - trusted server-side jobs (reservation expiry sweep, OCR pipeline)
 *
 * Never import this module from a Client Component, and never forward its
 * results to the browser without filtering out privileged fields.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv, getServerEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function createAdminClient() {
  const publicEnv = getPublicEnv();
  const serverEnv = getServerEnv();

  return createSupabaseClient<Database>(
    publicEnv.NEXT_PUBLIC_SUPABASE_URL,
    serverEnv.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}
