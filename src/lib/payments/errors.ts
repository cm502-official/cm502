/**
 * Slip-upload/verification error vocabulary — mirrors the pattern in
 * src/lib/orders/errors.ts. Every message is customer-safe: no SQL, no
 * Supabase error objects, no raw OCR/provider output (§20/§24).
 */
export type SlipUploadErrorCode =
  | "VALIDATION_ERROR"
  | "ORDER_NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "EXPIRED"
  | "ALREADY_VERIFIED"
  | "UNSUPPORTED_FORMAT"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "TOO_MANY_ATTEMPTS"
  | "SERVICE_UNAVAILABLE"
  | "UPLOAD_FAILED";

export const SLIP_UPLOAD_ERROR_MESSAGES: Record<SlipUploadErrorCode, string> = {
  VALIDATION_ERROR: "We couldn't process that request. Please try again.",
  ORDER_NOT_FOUND: "We couldn't find that order.",
  NOT_ELIGIBLE: "This order can't accept a payment slip right now.",
  EXPIRED: "This order's payment window has expired. Please place a new order.",
  ALREADY_VERIFIED: "This order's payment has already been confirmed.",
  UNSUPPORTED_FORMAT: "Please upload a JPG, PNG, or WEBP image.",
  FILE_TOO_LARGE: "That image is too large. Please upload a file under 8 MB.",
  EMPTY_FILE: "That file appears to be empty. Please choose a different image.",
  TOO_MANY_ATTEMPTS: "Too many upload attempts on this order. Please contact support.",
  SERVICE_UNAVAILABLE: "Upload is temporarily unavailable. Please try again shortly.",
  UPLOAD_FAILED: "We couldn't process your slip. Please try again.",
};

/** Maps the custom SQLSTATE codes raised by 0008_payment_verification.sql. */
export function mapPaymentDatabaseErrorCode(pgErrorCode: string | undefined): SlipUploadErrorCode {
  switch (pgErrorCode) {
    case "CM101":
      return "ORDER_NOT_FOUND";
    case "CM102":
      return "NOT_ELIGIBLE";
    case "CM103":
      return "EXPIRED";
    case "CM104":
      return "SERVICE_UNAVAILABLE";
    default:
      return "UPLOAD_FAILED";
  }
}
