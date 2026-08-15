"use client";

/**
 * Browser Supabase client. Uses only the public URL + anon key — RLS is the
 * only thing standing between this client and the database, so every table
 * it can touch MUST have RLS enabled with correct policies.
 */
import { createBrowserClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export function createClient() {
  const env = getPublicEnv();
  return createBrowserClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}
