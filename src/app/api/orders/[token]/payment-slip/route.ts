import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { resolveOrderForPayment } from "@/lib/payments/resolve-order-for-payment";
import { canUploadPaymentSlip, isPaymentVerified, isReservationExpired } from "@/lib/orders/lifecycle";
import { validateSlipFile } from "@/lib/payments/file-validation";
import { sha256Hex } from "@/lib/payments/hash";
import { buildSlipStoragePath } from "@/lib/payments/storage-path";
import { getPaymentSlipVerifier } from "@/lib/payments/get-verifier";
import { verifyPayment } from "@/lib/payments/verify";
import { getPaymentSettings } from "@/lib/payments/get-payment-settings";
import { mapPaymentDatabaseErrorCode, SLIP_UPLOAD_ERROR_MESSAGES, type SlipUploadErrorCode } from "@/lib/payments/errors";
import type { NormalizedSlipResult } from "@/lib/payments/types";
import { checkRateLimit, getClientIpKey } from "@/lib/rate-limit";

// Caps repeated upload/verification attempts on one order (§25/per-order
// guard). Every attempt — including duplicate-hash and duplicate-reference
// outcomes — is recorded in payment_verification_attempts, so this counts
// the same table the audit trail already relies on; no extra infrastructure.
const MAX_UPLOAD_ATTEMPTS = 5;

// Generic per-IP guard (§30/§31) — independent of order validity, so it
// also throttles someone hammering random/invalid tracking tokens trying
// to brute-force a real one. See src/lib/rate-limit.ts for the
// single-instance production caveat.
const RATE_LIMIT_MAX_REQUESTS = 20;
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000;

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const ipKey = getClientIpKey(request);
  const rateLimit = checkRateLimit(`payment-slip:${ipKey}`, RATE_LIMIT_MAX_REQUESTS, RATE_LIMIT_WINDOW_MS);
  if (!rateLimit.allowed) {
    return errorResponse("TOO_MANY_ATTEMPTS", 429);
  }

  const { token } = await params;

  const order = await resolveOrderForPayment(token);
  if (!order) {
    return errorResponse("ORDER_NOT_FOUND", 404);
  }

  if (isPaymentVerified(order)) {
    return errorResponse("ALREADY_VERIFIED", 409);
  }
  if (!canUploadPaymentSlip(order)) {
    const expired = order.paymentStatus === "expired" || isReservationExpired(order);
    return errorResponse(expired ? "EXPIRED" : "NOT_ELIGIBLE", expired ? 410 : 409);
  }

  let admin;
  try {
    admin = createAdminClient();
  } catch {
    return errorResponse("SERVICE_UNAVAILABLE", 503);
  }

  const { count: attemptCount } = await admin
    .from("payment_verification_attempts")
    .select("id", { count: "exact", head: true })
    .eq("payment_id", order.paymentId);

  if ((attemptCount ?? 0) >= MAX_UPLOAD_ATTEMPTS) {
    return errorResponse("TOO_MANY_ATTEMPTS", 429);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return errorResponse("VALIDATION_ERROR", 400);
  }

  const file = formData.get("slip");
  if (!(file instanceof File)) {
    return errorResponse("VALIDATION_ERROR", 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const validation = validateSlipFile(bytes);
  if (!validation.valid) {
    const codeByReason: Record<typeof validation.reason, SlipUploadErrorCode> = {
      empty: "EMPTY_FILE",
      too_large: "FILE_TOO_LARGE",
      unsupported_format: "UNSUPPORTED_FORMAT",
    };
    return errorResponse(codeByReason[validation.reason], 400);
  }

  const fileHash = sha256Hex(bytes);
  const storagePath = buildSlipStoragePath(order.id, validation.mimeType);

  let storageBucket = "payment-slips";
  try {
    storageBucket = getServerEnv().SUPABASE_STORAGE_SLIPS_BUCKET;
  } catch {
    // fall back to the default; not fatal
  }

  const { error: uploadError } = await admin.storage.from(storageBucket).upload(storagePath, bytes, {
    contentType: validation.mimeType,
    upsert: false,
  });
  if (uploadError) {
    console.error("[payment-slip] storage upload failed:", uploadError);
    return errorResponse("SERVICE_UNAVAILABLE", 503);
  }

  const { data: slipData, error: slipError } = await admin.rpc("record_payment_slip", {
    p_order_id: order.id,
    p_storage_path: storagePath,
    p_file_hash: fileHash,
    p_mime_type: validation.mimeType,
    p_file_size_bytes: bytes.length,
  });

  if (slipError) {
    console.error("[payment-slip] record_payment_slip failed:", slipError);
    return errorResponse(mapPaymentDatabaseErrorCode(slipError.code), 502);
  }

  const slipResult = slipData as { outcome: string; slipId: string | null; paymentId: string };

  if (slipResult.outcome === "duplicate_slip" || slipResult.outcome === "expired") {
    return NextResponse.json({ status: slipResult.outcome, message: outcomeMessage(slipResult.outcome) });
  }

  // ── OCR + verification decision ──────────────────────────────────────
  const verifier = getPaymentSlipVerifier();
  const slip: NormalizedSlipResult = verifier
    ? await verifier.verifySlip(bytes, validation.mimeType)
    : {
        amountSatang: null,
        currency: null,
        transferredAt: null,
        senderName: null,
        senderAccount: null,
        receiverName: null,
        receiverAccount: null,
        bankName: null,
        transactionReference: null,
        provider: "unconfigured",
        confidence: null,
        rawResponse: { note: "No OCR provider configured" },
      };

  const settings = await getPaymentSettings();
  const decision = verifyPayment({
    expectedAmountSatang: order.expectedAmountSatang,
    orderCreatedAt: order.createdAt,
    reservationExpiresAt: order.reservationExpiresAt,
    configuredReceiver: settings.bankTransfer
      ? {
          bankName: settings.bankTransfer.bankName,
          accountName: settings.bankTransfer.accountName,
          accountNumber: settings.bankTransfer.accountNumber,
          promptPayId: settings.promptPay?.promptPayId ?? null,
        }
      : null,
    slip,
  });

  const { data: finalizeData, error: finalizeError } = await admin.rpc("finalize_payment_verification", {
    p_order_id: order.id,
    p_slip_id: slipResult.slipId,
    p_outcome: decision.outcome,
    p_detected_amount_satang: slip.amountSatang,
    p_transaction_reference: slip.transactionReference,
    p_sender_name: slip.senderName,
    p_sender_account: slip.senderAccount,
    p_receiver_name: slip.receiverName,
    p_receiver_account: slip.receiverAccount,
    p_bank_name: slip.bankName,
    p_transferred_at: slip.transferredAt,
    p_ocr_provider: slip.provider,
    p_ocr_confidence: slip.confidence,
    p_ocr_result: slip.rawResponse ?? null,
    p_check_amount_match: decision.checks.amountMatch,
    p_check_receiver_match: decision.checks.receiverMatch,
    p_check_timestamp_ok: decision.checks.timestampOk,
    p_notes: decision.reason,
  });

  if (finalizeError) {
    console.error("[payment-slip] finalize_payment_verification failed:", finalizeError);
    return errorResponse(mapPaymentDatabaseErrorCode(finalizeError.code), 502);
  }

  const outcome = (finalizeData as { outcome: string }).outcome;

  return NextResponse.json({ status: outcome, message: outcomeMessage(outcome) });
}

function outcomeMessage(outcome: string): string {
  switch (outcome) {
    case "verified":
      return "Payment confirmed.";
    case "needs_review":
      return "Your slip is under review. We'll update your order shortly.";
    case "rejected":
      return "This slip could not be verified. Please check the details and try again.";
    case "duplicate_slip":
      return "This slip has already been used for another payment.";
    case "expired":
      return "This order's payment window has expired.";
    default:
      return "Your slip has been received.";
  }
}

function errorResponse(code: SlipUploadErrorCode, status: number) {
  return NextResponse.json({ error: { code, message: SLIP_UPLOAD_ERROR_MESSAGES[code] } }, { status });
}
