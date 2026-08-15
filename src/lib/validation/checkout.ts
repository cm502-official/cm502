/**
 * Checkout validation — shared shape used by both the client-side form
 * (fast feedback) and the /api/orders route handler (the check that
 * actually matters; the browser can't be trusted to run this at all).
 */
import { z } from "zod";

const MAX_QUANTITY_PER_LINE = 10;
const MAX_LINES_PER_ORDER = 20;

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
  .min(1, "Phone number is required")
  .transform(normalizePhone)
  .refine((v) => THAI_PHONE_REGEX.test(v), {
    message: "Enter a valid Thai phone number, e.g. 081-234-5678",
  });

export const emailSchema = z
  .string()
  .trim()
  .email("Enter a valid email address")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : undefined));

export const postalCodeSchema = z
  .string()
  .trim()
  .regex(/^\d{5}$/, "Postal code must be exactly 5 digits");

export const requiredTextSchema = (label: string, max = 200) =>
  z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .max(max, `${label} is too long`);

export const customerSchema = z.object({
  fullName: requiredTextSchema("Full name"),
  phone: phoneSchema,
  lineId: z.string().trim().max(100).optional().or(z.literal("")).transform((v) => (v ? v : undefined)),
  email: emailSchema,
});

export const addressSchema = z.object({
  addressLine: requiredTextSchema("Address"),
  subdistrict: requiredTextSchema("Subdistrict"),
  district: requiredTextSchema("District"),
  province: requiredTextSchema("Province"),
  postalCode: postalCodeSchema,
});

export const cartLineSchema = z.object({
  variantId: z.string().uuid("Invalid item"),
  quantity: z
    .number()
    .int("Quantity must be a whole number")
    .min(1, "Quantity must be at least 1")
    .max(MAX_QUANTITY_PER_LINE, `Quantity can't exceed ${MAX_QUANTITY_PER_LINE} per item`),
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
});

export type CustomerInput = z.infer<typeof customerSchema>;
export type AddressInput = z.infer<typeof addressSchema>;
export type CartLineInput = z.infer<typeof cartLineSchema>;
export type CreateOrderRequest = z.infer<typeof createOrderRequestSchema>;
