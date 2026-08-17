"use client";

import { useEffect } from "react";

/**
 * Shared centered-modal-on-desktop / bottom-sheet-on-mobile overlay, used
 * by both the pricing breakdown and the size chart so they behave (and
 * close) identically: Escape key, backdrop click, or the × button. Pure
 * CSS responsive switch (no JS breakpoint check) — a fixed bottom sheet
 * below the `sm` breakpoint, a centered panel at/above it.
 */
export function Overlay({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Wider panel for content-heavy overlays (e.g. the multi-row shirt customization editor). */
  wide?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/70" aria-hidden />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className={`relative z-10 flex max-h-[85vh] w-full flex-col overflow-hidden border-t border-line bg-background sm:border ${
          wide ? "sm:max-w-3xl" : "sm:max-w-sm"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-5 py-4">
          <p className="text-xs font-semibold uppercase tracking-[0.15em]">{title}</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center text-lg text-foreground/60 transition-colors hover:text-foreground"
          >
            ×
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  );
}
