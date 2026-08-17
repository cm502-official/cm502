"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AdminSignOutButton() {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleSignOut}
      className="text-xs font-medium uppercase tracking-wide text-foreground/60 underline underline-offset-4 transition-colors hover:text-foreground"
    >
      Sign out
    </button>
  );
}
