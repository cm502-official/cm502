"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { formatCountdown, getCountdownState } from "@/lib/orders/lifecycle";

/**
 * Countdown driven by the server-authoritative `expiresAt` timestamp.
 * The browser clock only decides what to *display* every second; it
 * never itself decides the order is expired for real. When the visible
 * countdown reaches zero, this triggers a single `router.refresh()` so
 * the Server Component re-fetches the real order state (which by then
 * should reflect the cron sweep, or at minimum re-derives the expired
 * state itself from `reservationExpiresAt`) — the countdown never writes
 * to the database directly.
 */
export function OrderCountdown({ expiresAt }: { expiresAt: string | null }) {
  const router = useRouter();
  const [now, setNow] = useState(() => Date.now());
  const hasRefreshedRef = useRef(false);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const state = getCountdownState(expiresAt, now);

  useEffect(() => {
    if (state.status === "expired" && !hasRefreshedRef.current) {
      hasRefreshedRef.current = true;
      router.refresh();
    }
  }, [state.status, router]);

  if (state.status === "no-deadline" || state.status === "invalid") {
    return null;
  }

  if (state.status === "expired") {
    return (
      <p className="text-sm font-medium text-accent" role="status">
        Payment window expired
      </p>
    );
  }

  return (
    <p className="text-sm text-foreground/70" role="status" aria-live="polite">
      Time remaining to pay:{" "}
      <span className="font-medium tabular-nums text-foreground">{formatCountdown(state.remainingMs)}</span>
    </p>
  );
}
