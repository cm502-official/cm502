"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

type UploadState =
  | { phase: "idle" }
  | { phase: "selected"; file: File; previewUrl: string }
  | { phase: "uploading"; file: File; previewUrl: string }
  | { phase: "done"; status: string; message: string }
  | { phase: "error"; message: string };

const ACCEPTED_TYPES = "image/jpeg,image/png,image/webp";
const MAX_SIZE_BYTES = 8 * 1024 * 1024;

export function SlipUploadForm({ trackingToken }: { trackingToken: string }) {
  const router = useRouter();
  const [state, setState] = useState<UploadState>({ phase: "idle" });
  const inputRef = useRef<HTMLInputElement>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > MAX_SIZE_BYTES) {
      setState({ phase: "error", message: "That image is too large. Please choose a file under 8 MB." });
      return;
    }
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setState({ phase: "error", message: "Please choose a JPG, PNG, or WEBP image." });
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setState({ phase: "selected", file, previewUrl });
  }

  function handleReplace() {
    if (state.phase === "selected" || state.phase === "uploading") {
      URL.revokeObjectURL(state.previewUrl);
    }
    setState({ phase: "idle" });
    if (inputRef.current) inputRef.current.value = "";
  }

  async function handleSubmit() {
    if (state.phase !== "selected") return;
    const { file, previewUrl } = state;
    setState({ phase: "uploading", file, previewUrl });

    try {
      const form = new FormData();
      form.set("slip", file);

      const res = await fetch(`/api/orders/${trackingToken}/payment-slip`, {
        method: "POST",
        body: form,
      });
      const body = await res.json().catch(() => null);

      if (!res.ok && !body?.status) {
        setState({ phase: "error", message: body?.error?.message ?? "We couldn't process your slip. Please try again." });
        return;
      }

      setState({ phase: "done", status: body.status, message: body.message });
      router.refresh();
    } catch {
      setState({ phase: "error", message: "Network error. Please try again." });
    }
  }

  if (state.phase === "done") {
    return <ResultPanel status={state.status} message={state.message} onRetry={handleReplace} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {state.phase === "idle" && (
        <label
          htmlFor="slip-upload-input"
          className="flex h-40 cursor-pointer flex-col items-center justify-center gap-2 border border-dashed border-line text-center text-sm text-foreground/60 transition-colors hover:border-ink"
        >
          <span className="font-medium text-foreground">Upload Payment Slip</span>
          <span className="text-xs">JPG, PNG, or WEBP · up to 8 MB</span>
          <input
            ref={inputRef}
            id="slip-upload-input"
            type="file"
            accept={ACCEPTED_TYPES}
            capture="environment"
            onChange={handleFileChange}
            className="sr-only"
          />
        </label>
      )}

      {(state.phase === "selected" || state.phase === "uploading") && (
        <div className="flex flex-col gap-4">
          <div className="relative aspect-[3/4] w-full max-w-xs self-center overflow-hidden border border-line bg-paper-dim">
            {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview, not an optimizable remote asset */}
            <img src={state.previewUrl} alt="Selected payment slip preview" className="h-full w-full object-contain" />
          </div>

          <div className="flex gap-3">
            <button
              type="button"
              onClick={handleReplace}
              disabled={state.phase === "uploading"}
              className="h-12 flex-1 border border-line text-xs font-semibold uppercase tracking-[0.15em] disabled:opacity-40"
            >
              Replace Image
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={state.phase === "uploading"}
              className="h-12 flex-1 bg-ink text-xs font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {state.phase === "uploading" ? "Uploading…" : "Submit Slip"}
            </button>
          </div>

          {state.phase === "uploading" && (
            <p role="status" className="text-center text-xs text-foreground/60">
              Checking payment…
            </p>
          )}
        </div>
      )}

      {state.phase === "error" && (
        <div className="flex flex-col gap-3">
          <p role="alert" className="border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
            {state.message}
          </p>
          <button
            type="button"
            onClick={handleReplace}
            className="h-12 w-full border border-ink text-xs font-semibold uppercase tracking-[0.15em]"
          >
            Try Again
          </button>
        </div>
      )}
    </div>
  );
}

function ResultPanel({ status, message, onRetry }: { status: string; message: string; onRetry: () => void }) {
  const canRetry = status === "needs_review" || status === "rejected" || status === "duplicate_slip";

  const tone =
    status === "verified"
      ? "border-line"
      : status === "needs_review"
        ? "border-line"
        : "border-accent/40 bg-accent/5";

  return (
    <div className={`flex flex-col gap-3 border p-5 text-center ${tone}`}>
      <p className="text-sm font-medium" role="status">
        {statusHeadline(status)}
      </p>
      <p className="text-sm text-foreground/70">{message}</p>
      {canRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2 h-12 w-full border border-ink text-xs font-semibold uppercase tracking-[0.15em]"
        >
          Upload a Different Slip
        </button>
      )}
    </div>
  );
}

function statusHeadline(status: string): string {
  switch (status) {
    case "verified":
      return "Payment Confirmed";
    case "needs_review":
      return "Payment Under Review";
    case "rejected":
      return "Payment Rejected";
    case "duplicate_slip":
      return "Duplicate Slip Detected";
    case "expired":
      return "Payment Window Expired";
    default:
      return "Slip Received";
  }
}
