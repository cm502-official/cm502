/**
 * Order-creation error vocabulary shared between the API route and the
 * checkout UI, so the two never drift out of sync on what a code means.
 * Every message here is written to be shown directly to a customer — no
 * SQL, no Supabase error objects, no stack traces (see §23).
 */
export type OrderErrorCode =
  | "VALIDATION_ERROR"
  | "EMPTY_CART"
  | "SHIPPING_METHOD_UNAVAILABLE"
  | "ITEM_UNAVAILABLE"
  | "OUT_OF_STOCK"
  | "ORDER_CREATION_FAILED"
  | "SERVICE_UNAVAILABLE";

export const ORDER_ERROR_MESSAGES: Record<OrderErrorCode, string> = {
  VALIDATION_ERROR: "Please check the highlighted fields and try again.",
  EMPTY_CART: "Your cart is empty.",
  SHIPPING_METHOD_UNAVAILABLE: "That shipping method is no longer available. Please choose another.",
  ITEM_UNAVAILABLE: "One of the items in your cart is no longer available.",
  OUT_OF_STOCK: "One of the items in your cart just sold out.",
  ORDER_CREATION_FAILED: "We couldn't place your order. Please try again.",
  SERVICE_UNAVAILABLE: "Ordering is temporarily unavailable. Please try again shortly.",
};

export class OrderCreationError extends Error {
  code: OrderErrorCode;

  constructor(code: OrderErrorCode, message?: string) {
    super(message ?? ORDER_ERROR_MESSAGES[code]);
    this.code = code;
    this.name = "OrderCreationError";
  }
}

/**
 * Maps the custom SQLSTATE codes raised by create_order_with_reservation()
 * (supabase/migrations/0004_commerce.sql) to a customer-safe error code.
 * Falls back to a generic failure for anything unrecognized rather than
 * leaking the underlying Postgres message.
 */
export function mapDatabaseErrorCode(pgErrorCode: string | undefined): OrderErrorCode {
  switch (pgErrorCode) {
    case "CM001":
      return "EMPTY_CART";
    case "CM002":
      return "SHIPPING_METHOD_UNAVAILABLE";
    case "CM003":
      return "VALIDATION_ERROR";
    case "CM004":
      return "ITEM_UNAVAILABLE";
    case "CM005":
      return "OUT_OF_STOCK";
    default:
      return "ORDER_CREATION_FAILED";
  }
}
