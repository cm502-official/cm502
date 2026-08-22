import Link from "next/link";
import { requireAdminUser } from "@/lib/admin/require-admin";
import { AdminSignOutButton } from "@/components/admin/admin-sign-out-button";

/**
 * Every route under this group requires an active admin_users row
 * (requireAdminUser() redirects to /admin/login otherwise). Kept as a
 * route group — not applied to /admin/login itself — so the login page
 * never inherits this guard and can't loop.
 */
export default async function AdminProtectedLayout({ children }: { children: React.ReactNode }) {
  const admin = await requireAdminUser();

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 sm:px-6">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-4">
        <div className="flex items-center gap-6">
          <div>
            <Link href="/admin/orders" className="font-display text-xl uppercase tracking-wide">
              CM502 Staff
            </Link>
            <p className="text-xs text-foreground/50">{admin.fullName}</p>
          </div>
          <nav className="flex items-center gap-4 text-sm font-medium tracking-wide">
            <Link href="/admin/orders" className="transition-opacity hover:opacity-60">
              Orders
            </Link>
            <Link href="/admin/report" className="transition-opacity hover:opacity-60">
              Report
            </Link>
          </nav>
        </div>
        <AdminSignOutButton />
      </div>
      <div className="mt-8">{children}</div>
    </div>
  );
}
