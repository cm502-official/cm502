/**
 * Proof-upload error vocabulary — mirrors src/lib/payments/errors.ts.
 * Thai, customer-safe messages only (§16) — no SQL/Supabase internals.
 */
export type ProofUploadErrorCode =
  | "VALIDATION_ERROR"
  | "ORDER_NOT_FOUND"
  | "NOT_ELIGIBLE"
  | "UNSUPPORTED_FORMAT"
  | "FILE_TOO_LARGE"
  | "EMPTY_FILE"
  | "TOO_MANY_ATTEMPTS"
  | "SERVICE_UNAVAILABLE"
  | "UPLOAD_FAILED";

export const PROOF_UPLOAD_ERROR_MESSAGES: Record<ProofUploadErrorCode, string> = {
  VALIDATION_ERROR: "คำขอไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง",
  ORDER_NOT_FOUND: "ไม่พบคำสั่งซื้อนี้",
  NOT_ELIGIBLE: "คำสั่งซื้อนี้ไม่ได้เลือกรับสิทธิ์ส่งฟรี จึงไม่สามารถอัปโหลดหลักฐานได้",
  UNSUPPORTED_FORMAT: "กรุณาอัปโหลดไฟล์ภาพ JPG, PNG หรือ WEBP",
  FILE_TOO_LARGE: "ไฟล์มีขนาดใหญ่เกินไป กรุณาลองใหม่",
  EMPTY_FILE: "ไฟล์นี้ว่างเปล่า กรุณาเลือกไฟล์ภาพอื่น",
  TOO_MANY_ATTEMPTS: "อัปโหลดหลักฐานสำหรับคำสั่งซื้อนี้บ่อยเกินไป กรุณาติดต่อทีมงาน",
  SERVICE_UNAVAILABLE: "ระบบอัปโหลดหลักฐานไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง",
  UPLOAD_FAILED: "อัปโหลดหลักฐานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};
