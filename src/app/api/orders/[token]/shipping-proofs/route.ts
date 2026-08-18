import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { resolveOrderForProofUpload } from "@/lib/shipping-proofs/resolve-order-for-proof-upload";
import { validateProofFile } from "@/lib/shipping-proofs/file-validation";
import { buildProofStoragePath } from "@/lib/shipping-proofs/storage-path";
import { isProofType, getProofSlotConfig, hasAllRequiredProofs, countValidProofs, REQUIRED_PROOF_COUNT } from "@/lib/shipping-proofs/proof-types";
import { PROOF_UPLOAD_ERROR_MESSAGES, type ProofUploadErrorCode } from "@/lib/shipping-proofs/errors";
import { checkRateLimit, getClientIpKey } from "@/lib/rate-limit";

/**
 * POST /api/orders/[token]/shipping-proofs
 *
 * One proof screenshot per request (§V — a single failed upload out of 7
 * must be retryable without resubmitting the others). The client has
 * already compressed the image (§H); this route independently
 * re-validates it (§J — never trusts the client's compression, claimed
 * MIME type, or filename) and stores it privately, keyed to the order
 * the token proves ownership of. Always routed through the service-role
 * client (§Z) — checkout is guest-based, so there's no customer session
 * to scope an RLS policy to.
 */

// One attempt per proof category is normal; a handful of retries is
// legitimate (network blip, replaced screenshot) but this bounds abuse
// on one order regardless of which category is targeted each time.
const MAX_UPLOAD_ATTEMPTS_PER_ORDER = 30;
const RATE_LIMIT_MAX_REQUESTS = 40;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ipKey = getClientIpKey(request);
  const rateLimit = checkRateLimit(`shipping-proof:${ipKey}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return errorResponse("TOO_MANY_ATTEMPTS", 429);
  }

  const { token } = await params;
  const order = await resolveOrderForProofUpload(token);
  if (!order) {
    return errorResponse("ORDER_NOT_FOUND", 404);
  }

  // §K/§Q: only an order that actually recorded the free-shipping choice
  // (set server-side at creation, never client-editable afterward) may
  // ever accept a proof upload.
  if (order.shippingChoice !== "free_social_proof") {
    return errorResponse("NOT_ELIGIBLE", 409);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return errorResponse("SERVICE_UNAVAILABLE", 503);
  }

  const { count: attemptCount } = await admin
    .from("order_shipping_proofs")
    .select("id", { count: "exact", head: true })
    .eq("order_id", order.id);
  // attemptCount here only reflects successfully-stored proofs, not
  // attempts — use a coarse cumulative guard instead via the rate
  // limiter above, which already scopes per-IP. This existing-count
  // check just prevents a pathological loop from ever exceeding the
  // per-order storage the UI can show anyway.
  if ((attemptCount ?? 0) > MAX_UPLOAD_ATTEMPTS_PER_ORDER) {
    return errorResponse("TOO_MANY_ATTEMPTS", 429);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("VALIDATION_ERROR", 400);
  }

  const proofTypeRaw = formData.get("proofType");
  if (typeof proofTypeRaw !== "string" || !isProofType(proofTypeRaw)) {
    return errorResponse("VALIDATION_ERROR", 400);
  }
  const proofType = proofTypeRaw;
  const { platform } = getProofSlotConfig(proofType);

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return errorResponse("VALIDATION_ERROR", 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateProofFile(bytes);
  if (!validation.valid) {
    const codeByReason: Record<typeof validation.reason, ProofUploadErrorCode> = {
      empty: "EMPTY_FILE",
      too_large: "FILE_TOO_LARGE",
      unsupported_format: "UNSUPPORTED_FORMAT",
    };
    return errorResponse(codeByReason[validation.reason], 400);
  }

  const storagePath = buildProofStoragePath(order.id, proofType, validation.mimeType);

  let bucket = "shipping-proofs";
  try {
    bucket = getServerEnv().SUPABASE_STORAGE_SHIPPING_PROOFS_BUCKET;
  } catch {
    // fall back to the default; not fatal
  }

  // Deterministic path per (order, proof type) — a retry/replace of the
  // same category overwrites its own object rather than orphaning the
  // previous attempt (§H/§storage-path.ts).
  const { error: uploadError } = await admin.storage.from(bucket).upload(storagePath, bytes, {
    contentType: validation.mimeType,
    upsert: true,
  });
  if (uploadError) {
    console.error("[shipping-proofs] storage upload failed:", uploadError);
    return errorResponse("SERVICE_UNAVAILABLE", 503);
  }

  const { error: dbError } = await admin
    .from("order_shipping_proofs")
    .upsert(
      {
        order_id: order.id,
        platform,
        proof_type: proofType,
        storage_path: storagePath,
        file_size_bytes: bytes.length,
        mime_type: validation.mimeType,
      },
      { onConflict: "order_id,proof_type" },
    );

  if (dbError) {
    console.error("[shipping-proofs] record failed:", dbError);
    return errorResponse("UPLOAD_FAILED", 502);
  }

  const updatedProofTypes = [...order.existingProofTypes.filter((t) => t !== proofType), proofType];

  return NextResponse.json({
    proofType,
    uploaded: true,
    completedCount: countValidProofs(updatedProofTypes),
    requiredCount: REQUIRED_PROOF_COUNT,
    allComplete: hasAllRequiredProofs(updatedProofTypes),
  });
}

function errorResponse(code: ProofUploadErrorCode, status: number) {
  return NextResponse.json({ error: { code, message: PROOF_UPLOAD_ERROR_MESSAGES[code] } }, { status });
}
