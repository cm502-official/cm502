/**
 * Checkout validation — shared shape used by both the client-side form
 * (fast feedback) and the /api/orders route handler (the check that
 * actually matters; the browser can't be trusted to run this at all).
 *
 * Customer-facing messages are Thai (§16) — CM502 only ships within
 * Thailand and the storefront UI is Thai throughout checkout.
 */
import { z } from "zod";
import { resolveThaiAddressHierarchy } from "@/lib/thai-address";
import { SHIPPING_CHOICES } from "@/lib/shipping-proofs/shipping-choice";

// The jersey is sold as unlimited preorder (§ create_order_with_reservation
// preorder bypass) — these are no longer stock-derived caps, just a sane
// ceiling against malformed/adversarial input (integer overflow, a typo
// with an extra zero, etc.), not a real business limit. Kept well above
// any realistic bulk preorder (hundreds of shirts).
const MAX_QUANTITY_PER_LINE = 100000;
const MAX_LINES_PER_ORDER = 100;

function normalizePhone(raw: string): string {
  return raw.replace(/[\s-]/g, "");
}

// Thai mobile/landline: 0XXXXXXXX(X) after stripping spaces/hyphens, or
// the same number in +66 / 66 international form. Deliberately permissive
// about local formatting (081-234-5678, 081 234 5678, 0812345678 all
// normalize the same) rather than rejecting legitimate variations.
const THAI_PHONE_REGEX = /^(?:\+66|66|0)\d{8,9}$/;

export const phoneSchema = z
  .string()
  .trim()
  .min(1, "กรุณากรอกเบอร์โทรศัพท์")
  .transform(normalizePhone)
  .refine((v) => THAI_PHONE_REGEX.test(v), {
    message: "กรุณากรอกเบอร์โทรศัพท์ให้ถูกต้อง",
  });

// Email is required at checkout (§9) — used for order confirmation, not
// an account. Still plain guest checkout; no registration involved.
export const emailSchema = z.string().trim().min(1, "กรุณากรอกอีเมล").email("กรุณากรอกอีเมลให้ถูกต้อง");

export const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "รหัสไปรษณีย์ไม่ถูกต้อง");

export const requiredTextSchema = (requiredMessage: string, max: number, tooLongMessage: string) =>
  z.string().trim().min(1, requiredMessage).max(max, tooLongMessage);

export const customerSchema = z.object({
  // Kept as one field (matches the existing customers.full_name column,
  // §7) — the UI label reads "ชื่อ-นามสกุลผู้รับ" without splitting the
  // database or payload shape.
  fullName: requiredTextSchema("กรุณากรอกชื่อผู้รับ", 200, "ชื่อผู้รับยาวเกินไป"),
  phone: phoneSchema,
  lineId: z.string().trim().max(100).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  email: emailSchema,
});

const DELIVERY_NOTE_MAX_LENGTH = 200;
const SOI_ROAD_MAX_LENGTH = 200;

// Province/District/Subdistrict are selected from the static Thai
// administrative dataset (§ thai-address) as ids, never free-typed —
// z.coerce so a <select>'s string value ("" for the unselected
// placeholder, "38" once chosen) parses the same way on the client and
// from a raw JSON API request. An empty/non-numeric/zero value all
// collapse to the same "please select" message.
const requiredSelectId = (message: string) => z.coerce.number({ error: message }).int(message).positive(message);

export const provinceIdSchema = requiredSelectId("กรุณาเลือกจังหวัด");
export const districtIdSchema = requiredSelectId("กรุณาเลือกอำเภอ / เขต");
export const subdistrictIdSchema = requiredSelectId("กรุณาเลือกตำบล / แขวง");

export const addressSchema = z
  .object({
    // บ้านเลขที่ / อาคาร / หมู่บ้าน / ห้อง (§10) — reuses the existing
    // addresses.address_line column, just relabeled in the UI.
    addressLine: requiredTextSchema("กรุณากรอกรายละเอียดที่อยู่", 500, "รายละเอียดที่อยู่ยาวเกินไป"),
    // ซอย / ถนน (§10) — optional; many Thai addresses legitimately have
    // neither.
    soiRoad: z.string().trim().max(SOI_ROAD_MAX_LENGTH, "ซอย/ถนน ยาวเกินไป").optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
    provinceId: provinceIdSchema,
    districtId: districtIdSchema,
    subdistrictId: subdistrictIdSchema,
    // Auto-filled from the selected subdistrict client-side (§6); still
    // independently validated as a real Thai 5-digit postcode, and
    // cross-checked against the resolved subdistrict below — a
    // stale/tampered value can never reach storage.
    postalCode: postalCodeSchema,
    // หมายเหตุสำหรับการจัดส่ง (§11) — optional, capped so a malicious
    // request can't smuggle an unbounded payload through a free-text field.
    deliveryNote: z
      .string()
      .trim()
      .max(DELIVERY_NOTE_MAX_LENGTH, `หมายเหตุต้องไม่เกิน ${DELIVERY_NOTE_MAX_LENGTH} ตัวอักษร`)
      .optional()
      .or(z.literal(""))
      .transform((v) => (v ? v : undefined)),
  })
  // The actual hierarchy trust boundary (§15): independently walks
  // subdistrict → district → province in the server's own copy of the
  // dataset. A syntactically valid but inconsistent combination (e.g. a
  // real subdistrict id paired with an unrelated province id, or a
  // postal code that doesn't match the resolved subdistrict) fails here,
  // not just format checks on each field in isolation.
  .refine((addr) => resolveThaiAddressHierarchy(addr) !== null, {
    message: "ที่อยู่ไม่ถูกต้อง กรุณาเลือกจังหวัด/อำเภอ/ตำบลใหม่อีกครั้ง",
    path: ["subdistrictId"],
  });

// Per-shirt personalization (§ shirt customization) — the actual
// server-trusted boundary for name/number printing data. React-side
// validation (shirt-draft.ts) exists for fast feedback only; this is
// what /api/orders actually enforces.
const NAME_MAX_LENGTH = 15;
const JERSEY_NUMBER_REGEX = /^\d{1,2}$/;

export const shirtCustomizationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1)
    .max(NAME_MAX_LENGTH, `Name must be ${NAME_MAX_LENGTH} characters or fewer`)
    .nullable(),
  number: z
    .string()
    .regex(JERSEY_NUMBER_REGEX, "Number must be 0-99")
    .nullable(),
});

export const cartLineSchema = z
  .object({
    variantId: z.string().uuid("Invalid item"),
    quantity: z
      .number()
      .int("Quantity must be a whole number")
      .min(1, "Quantity must be at least 1")
      .max(MAX_QUANTITY_PER_LINE, `Quantity can't exceed ${MAX_QUANTITY_PER_LINE} per item`),
    // One entry per physical shirt — must exactly match `quantity`
    // (§22: "customization count matches quantity" is a required
    // server-side check, not just a client convenience).
    customizations: z.array(shirtCustomizationSchema).min(1),
  })
  .refine((line) => line.customizations.length === line.quantity, {
    message: "customizations.length must equal quantity",
    path: ["customizations"],
  });

// §K/§Q: only the enum choice is ever accepted from the client — never a
// numeric price. The server (route.ts + the RPC) derives the actual fee
// from this value; a request supplying anything else is rejected outright.
export const shippingChoiceSchema = z.enum(SHIPPING_CHOICES, {
  error: "กรุณาเลือกวิธีจัดส่ง",
});

export const createOrderRequestSchema = z.object({
  idempotencyKey: z.string().trim().min(1).max(100),
  items: z
    .array(cartLineSchema)
    .min(1, "Your cart is empty")
    .max(MAX_LINES_PER_ORDER, "Too many items in one order"),
  customer: customerSchema,
  address: addressSchema,
  shippingMethodId: z.string().uuid("Select a shipping method"),
  shippingChoice: shippingChoiceSchema,
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type CartLineInput = z.infer<typeof cartLineSchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
