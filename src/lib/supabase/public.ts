import "server-only";

/**
 * Anon-key Supabase client with NO cookie/session dependency — unlike
 * `createClient()` in server.ts, this never calls Next.js's `cookies()`,
 * which makes it the only client safe to use inside `unstable_cache`
 * (Next.js forbids/ignores dynamic APIs like cookies() in a cached
 * function; using the cookie-bound client there would either error or
 * silently defeat caching by forcing the whole render dynamic).
 *
 * Only use this for genuinely public, RLS-public-read data where an
 * anonymous visitor and a logged-in one see identical rows (catalog
 * browsing: products/colors/sizes/product_variants/product_images and
 * the get_active_variant_stock RPC — all public-read/anon-granted per
 * 0002_rls.sql and 0004_commerce.sql). Never for cart, checkout, order,
 * payment, or admin-scoped reads — those still need the cookie-bound
 * session client in server.ts.
 */
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function createPublicClient() {
  const env = getPublicEnv();
  return createSupabaseClient<Database>(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}
