import "server-only";

/**
 * Server Supabase client for use in Server Components, Route Handlers, and
 * Server Actions. Anon key + RLS — respects the current user's session via
 * cookies. This is the client customer-facing code should use; it can never
 * see rows RLS doesn't grant it.
 */
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";
import type { Database } from "@/lib/supabase/types";

export async function createClient() {
  const cookieStore = await cookies();
  const env = getPublicEnv();

  return createServerClient<Database>(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            for (const { name, value, options } of cookiesToSet) {
              cookieStore.set(name, value, options);
            }
          } catch {
            // Called from a Server Component render — a middleware
            // refreshing the session will pick this up instead. Safe to
            // ignore per Supabase SSR guidance.
          }
        },
      },
    },
  );
}
