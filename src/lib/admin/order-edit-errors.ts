/**
 * Admin order-edit error vocabulary — mirrors src/lib/orders/errors.ts.
 * Thai, customer/admin-safe messages only; never forwards a raw
 * Postgres/Supabase error to the browser (§6 "do not expose raw
 * database errors").
 */
export type AdminOrderEditErrorCode =
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "ORDER_NOT_FOUND"
  | "ITEM_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "CONFIRM_TOTAL_CHANGE_REQUIRED"
  | "EDIT_FAILED";

export const ADMIN_ORDER_EDIT_ERROR_MESSAGES: Record<AdminOrderEditErrorCode, string> = {
  VALIDATION_ERROR: "ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบและลองใหม่อีกครั้ง",
  UNAUTHORIZED: "ไม่มีสิทธิ์ดำเนินการนี้",
  ORDER_NOT_FOUND: "ไม่พบคำสั่งซื้อนี้",
  ITEM_UNAVAILABLE: "มีสินค้าบางรายการที่เลือกไม่พร้อมจำหน่ายแล้ว",
  OUT_OF_STOCK: "สินค้าบางรายการมีสต็อกไม่เพียงพอ",
  CONFIRM_TOTAL_CHANGE_REQUIRED:
    "คำสั่งซื้อนี้ยืนยันการชำระเงินแล้ว และยอดรวมจะเปลี่ยนแปลง กรุณายืนยันอีกครั้งเพื่อดำเนินการต่อ",
  EDIT_FAILED: "บันทึกการแก้ไขไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
};

/** Maps the custom SQLSTATE codes raised by admin_update_order_details() (0019). */
export function mapAdminOrderEditErrorCode(pgErrorCode: string | undefined): AdminOrderEditErrorCode {
  switch (pgErrorCode) {
    case "CM401":
      return "UNAUTHORIZED";
    case "CM404":
      return "ORDER_NOT_FOUND";
    case "CM003":
    case "CM006":
      return "VALIDATION_ERROR";
    case "CM004":
      return "ITEM_UNAVAILABLE";
    case "CM005":
      return "OUT_OF_STOCK";
    case "CM302":
      return "CONFIRM_TOTAL_CHANGE_REQUIRED";
    default:
      return "EDIT_FAILED";
  }
}
