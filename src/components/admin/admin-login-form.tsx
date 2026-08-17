"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Staff sign-in — the existing Supabase Auth + admin_users pattern
 * (see supabase/README.md "First admin user"), not a new secret. A
 * successful sign-in only proves the user has valid Supabase Auth
 * credentials; requireAdminUser() on the server still checks their
 * admin_users row before granting access to anything.
 */
export function AdminLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const redirectTo = searchParams.get("redirectTo") ?? "/admin/orders";
  const notAuthorized = searchParams.get("error") === "not_authorized";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });

    if (signInError) {
      setError("Invalid email or password.");
      setSubmitting(false);
      return;
    }

    router.push(redirectTo);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex w-full max-w-sm flex-col gap-4">
      {notAuthorized && (
        <p role="alert" className="border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
          That account isn&apos;t an active staff account.
        </p>
      )}
      <div className="flex flex-col gap-1.5">
        <label htmlFor="email" className="text-xs font-medium text-foreground/70">
          Email
        </label>
        <input
          id="email"
          type="email"
          required
          autoComplete="username"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 border border-line bg-background px-3 text-sm outline-none focus:border-foreground"
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="password" className="text-xs font-medium text-foreground/70">
          Password
        </label>
        <input
          id="password"
          type="password"
          required
          autoComplete="current-password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="h-12 border border-line bg-background px-3 text-sm outline-none focus:border-foreground"
        />
      </div>
      {error && (
        <p role="alert" className="text-sm text-accent">
          {error}
        </p>
      )}
      <button
        type="submit"
        disabled={submitting}
        className="h-12 bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {submitting ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
