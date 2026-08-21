import { type NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { getPublicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase auth session so Server Components always see a
 * valid session cookie, and acts as the first gate for /admin routes —
 * full role verification still happens per-request in admin
 * layouts/route handlers, this is just the cheap early bounce.
 *
 * Perf: only /admin actually uses a Supabase Auth session (this is a
 * guest-checkout storefront — no customer accounts, nothing else reads
 * `supabase.auth.*`). The auth refresh is a real network round trip to
 * Supabase Auth, so running it on every storefront request/prefetch
 * (homepage, product page, cart, checkout, ...) was pure unnecessary
 * latency on the vast majority of traffic. Bailing out before touching
 * Supabase at all for non-/admin paths removes that round trip entirely
 * from the "SHOP NOW" navigation without changing /admin's behavior.
 */
export async function proxy(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.next();
  }

  let response = NextResponse.next({ request });

  let env;
  try {
    env = getPublicEnv();
  } catch {
    // Supabase not configured yet (early scaffolding) — let the request
    // through; pages/route handlers that need Supabase will surface a
    // clear error themselves.
    return response;
  }

  const supabase = createServerClient(
    env.NEXT_PUBLIC_SUPABASE_URL,
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          response = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The login page itself must stay reachable while unauthenticated —
  // without this exemption, an anonymous visit to /admin/login redirects
  // to /admin/login?redirectTo=/admin/login, which is unauthenticated
  // too, which redirects again, forever (ERR_TOO_MANY_REDIRECTS).
  if (
    request.nextUrl.pathname.startsWith("/admin") &&
    request.nextUrl.pathname !== "/admin/login" &&
    !user
  ) {
    const loginUrl = new URL("/admin/login", request.url);
    loginUrl.searchParams.set("redirectTo", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp|gif)$).*)",
  ],
};
