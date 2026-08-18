"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * §O/§P — manual admin decision only, never automatic/OCR-based (§N).
 * Rejecting keeps the proof rows intact (§O: "do not delete the proof
 * automatically") and never triggers any payment adjustment (§P) — it
 * only records the review outcome for both admin and the customer
 * confirmation page (order-detail-card.tsx) to reflect.
 */
export function ProofReviewActions({
  orderNumber,
  currentStatus,
}: {
  orderNumber: string;
  currentStatus: string | null;
}) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState<"approved" | "rejected" | null>(null);
  const [showReasonFor, setShowReasonFor] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function review(decision: "approved" | "rejected", reasonText?: string) {
    setSubmitting(decision);
    setError(null);
    try {
      const res = await fetch(`/api/admin/orders/${orderNumber}/proof-review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ decision, reason: reasonText }),
      });
      if (!res.ok) {
        setError("บันทึกผลการตรวจสอบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
        return;
      }
      setShowReasonFor(false);
      router.refresh();
    } catch {
      setError("เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง");
    } finally {
      setSubmitting(null);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => review("approved")}
          disabled={submitting !== null}
          className="h-10 border border-ink bg-ink px-4 text-xs font-semibold uppercase tracking-wide text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {submitting === "approved" ? "กำลังบันทึก…" : "อนุมัติหลักฐาน"}
        </button>
        <button
          type="button"
          onClick={() => setShowReasonFor((v) => !v)}
          disabled={submitting !== null}
          className="h-10 border border-line px-4 text-xs font-semibold uppercase tracking-wide transition-colors hover:border-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          ไม่ผ่าน
        </button>
      </div>

      {showReasonFor && (
        <div className="flex flex-col gap-2">
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="เหตุผล (ถ้ามี)"
            maxLength={500}
            className="h-20 w-full border border-line bg-background p-2 text-xs outline-none focus:border-ink"
          />
          <button
            type="button"
            onClick={() => review("rejected", reason)}
            disabled={submitting !== null}
            className="h-10 w-fit border border-accent px-4 text-xs font-semibold uppercase tracking-wide text-accent transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {submitting === "rejected" ? "กำลังบันทึก…" : "ยืนยันว่าไม่ผ่าน"}
          </button>
        </div>
      )}

      {currentStatus && (
        <p className="text-xs text-foreground/60">สถานะปัจจุบัน: {reviewStatusLabel(currentStatus)}</p>
      )}
      {error && (
        <p role="alert" className="text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

function reviewStatusLabel(status: string): string {
  switch (status) {
    case "approved":
      return "อนุมัติแล้ว";
    case "rejected":
      return "ไม่ผ่าน";
    default:
      return "รอตรวจสอบ";
  }
}
