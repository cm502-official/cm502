import { Suspense } from "react";
import { AdminLoginForm } from "@/components/admin/admin-login-form";

export const metadata = { title: "Staff Sign In" };

export default function AdminLoginPage() {
  return (
    <section className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-6xl flex-col items-center justify-center px-4 py-16 sm:px-6">
      <h1 className="font-display text-3xl uppercase tracking-wide">CM502 Staff</h1>
      <p className="mt-2 text-sm text-foreground/60">Sign in to view orders.</p>
      <div className="mt-8">
        <Suspense>
          <AdminLoginForm />
        </Suspense>
      </div>
    </section>
  );
}
