/**
 * Payment slip file validation — never trusts a filename extension or a
 * client-supplied MIME header alone. `validateSlipFile` inspects the
 * actual magic bytes of the uploaded content, so a `.jpg` that's really
 * an HTML file (or an executable) is rejected regardless of what the
 * browser claimed it was.
 */

export const MAX_SLIP_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8 MB

export const ALLOWED_SLIP_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AllowedSlipMimeType = (typeof ALLOWED_SLIP_MIME_TYPES)[number];

/**
 * Detects an image format from its magic bytes. Returns null for
 * anything that isn't a recognized JPEG/PNG/WEBP signature — including a
 * mismatched claimed MIME type, a truncated file, or a non-image entirely.
 */
export function detectImageFormat(bytes: Uint8Array): AllowedSlipMimeType | null {
  if (bytes.length < 12) return null;

  // JPEG: FF D8 FF
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return "image/png";
  }

  // WEBP: "RIFF" .... "WEBP"
  if (
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return "image/webp";
  }

  return null;
}

export type SlipFileValidationResult =
  | { valid: true; mimeType: AllowedSlipMimeType }
  | { valid: false; reason: "empty" | "too_large" | "unsupported_format" };

export function validateSlipFile(bytes: Uint8Array): SlipFileValidationResult {
  if (bytes.length === 0) {
    return { valid: false, reason: "empty" };
  }
  if (bytes.length > MAX_SLIP_FILE_SIZE_BYTES) {
    return { valid: false, reason: "too_large" };
  }
  const detected = detectImageFormat(bytes);
  if (!detected) {
    return { valid: false, reason: "unsupported_format" };
  }
  return { valid: true, mimeType: detected };
}
