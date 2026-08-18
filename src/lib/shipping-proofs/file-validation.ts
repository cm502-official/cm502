/**
 * Server-side re-validation of an uploaded proof screenshot (§J) — never
 * trusts the client's compression result, its claimed MIME type, or its
 * filename. Magic-byte format detection is shared with the payment-slip
 * upload path (both only ever need JPEG/PNG/WEBP).
 */
import { detectImageFormat, type AllowedSlipMimeType } from "@/lib/payments/file-validation";
import { MAX_COMPRESSED_FILE_SIZE_BYTES } from "@/lib/media/image-compression";

export type ProofFileValidationResult =
  | { valid: true; mimeType: AllowedSlipMimeType }
  | { valid: false; reason: "empty" | "too_large" | "unsupported_format" };

export function validateProofFile(bytes: Uint8Array): ProofFileValidationResult {
  if (bytes.length === 0) return { valid: false, reason: "empty" };
  // Client-side compression targets <= 1 MB (§F); a proof arriving over
  // that after "compression" is either a bypassed client or a bug —
  // either way, reject rather than trust it.
  if (bytes.length > MAX_COMPRESSED_FILE_SIZE_BYTES) return { valid: false, reason: "too_large" };
  const detected = detectImageFormat(bytes);
  if (!detected) return { valid: false, reason: "unsupported_format" };
  return { valid: true, mimeType: detected };
}
