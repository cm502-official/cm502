import "server-only";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export interface AdminUser {
  id: string;
  fullName: string;
  role: "admin" | "staff";
}

/**
 * The actual authorization gate for every /admin page (§ admin security).
 *
 * `proxy.ts` already bounces an unauthenticated request to /admin/login
 * before it reaches here — that's a cheap early redirect only. This is
 * the real check: even a logged-in Supabase Auth user must also have an
 * active row in `admin_users` (role 'admin' or 'staff'). Uses the
 * RLS-scoped session client (not the service-role client) so a
 * non-admin session is blocked by Postgres RLS itself if this check were
 * ever bypassed — defense in depth, never just an app-level `if`.
 */
export async function requireAdminUser(): Promise<AdminUser> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRow || !adminRow.is_active) {
    await supabase.auth.signOut();
    redirect("/admin/login?error=not_authorized");
  }

  return { id: adminRow.id, fullName: adminRow.full_name, role: adminRow.role as "admin" | "staff" };
}

/**
 * Same authorization check as requireAdminUser(), but for API Route
 * Handlers — returns null instead of calling next/navigation's
 * redirect(), which would produce a confusing HTML redirect response
 * for a JSON API caller instead of a clean 401/403.
 */
export async function getAdminUserOrNull(): Promise<AdminUser | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data: adminRow } = await supabase
    .from("admin_users")
    .select("id, full_name, role, is_active")
    .eq("id", user.id)
    .maybeSingle();

  if (!adminRow || !adminRow.is_active) return null;

  return { id: adminRow.id, fullName: adminRow.full_name, role: adminRow.role as "admin" | "staff" };
}
