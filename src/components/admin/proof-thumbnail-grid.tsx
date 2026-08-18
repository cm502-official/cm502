"use client";

import { useState } from "react";
import type { AdminOrderProof } from "@/lib/admin/get-admin-order-detail";

/**
 * §AB — small/efficient thumbnails, with a larger lightbox on click for
 * actually inspecting the screenshot (username/Follow/Like/Story/Repost/
 * Comment state). Every `signedUrl` here was already generated
 * server-side with a short expiry (§Z) — this component never talks to
 * Storage directly.
 */
export function ProofThumbnailGrid({ proofs }: { proofs: AdminOrderProof[] }) {
  const [openProof, setOpenProof] = useState<AdminOrderProof | null>(null);

  return (
    <>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {proofs.map((proof) => (
          <button
            key={proof.proofType}
            type="button"
            onClick={() => proof.signedUrl && setOpenProof(proof)}
            disabled={!proof.signedUrl}
            className="flex flex-col gap-1 text-left disabled:cursor-not-allowed disabled:opacity-40"
          >
            <span className="relative aspect-[9/16] w-full overflow-hidden border border-line bg-paper-dim">
              {proof.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL, not an optimizable static asset
                <img src={proof.signedUrl} alt={proof.label} className="h-full w-full object-contain" />
              ) : (
                <span className="flex h-full w-full items-center justify-center text-[10px] text-foreground/40">
                  ไม่สามารถโหลดรูปได้
                </span>
              )}
            </span>
            <span className="text-[10px] text-foreground/70">{proof.label}</span>
          </button>
        ))}
      </div>

      {openProof && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={openProof.label}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6"
          onClick={() => setOpenProof(null)}
        >
          <div className="flex max-h-full max-w-full flex-col gap-2" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-4 text-paper">
              <span className="text-sm font-medium">{openProof.label}</span>
              <button
                type="button"
                onClick={() => setOpenProof(null)}
                className="text-xs font-semibold uppercase tracking-wide underline underline-offset-4"
              >
                ปิด
              </button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- short-lived signed Storage URL */}
            <img
              src={openProof.signedUrl ?? undefined}
              alt={openProof.label}
              className="max-h-[80vh] max-w-full object-contain"
            />
          </div>
        </div>
      )}
    </>
  );
}
