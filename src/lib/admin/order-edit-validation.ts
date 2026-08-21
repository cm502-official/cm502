/**
 * Admin order-edit request validation — deliberately reuses the exact
 * same schemas checkout already validates against (customerSchema,
 * addressSchema with its Thai-hierarchy refine, cartLineSchema with its
 * customization-count-matches-quantity rule) rather than inventing a
 * parallel free-text/less-strict path for admin. The only admin-only
 * addition is confirmTotalChange, for the "editing a verified-paid
 * order changes the total" guard (§4).
 */
import { z } from "zod";
import { addressSchema, cartLineSchema, customerSchema } from "@/lib/validation/checkout";

export const adminOrderEditRequestSchema = z.object({
  customer: customerSchema,
  address: addressSchema,
  items: z.array(cartLineSchema).min(1, "ต้องมีเสื้ออย่างน้อย 1 ตัวในคำสั่งซื้อ"),
  confirmTotalChange: z.boolean().optional().default(false),
});

export type AdminOrderEditRequest = z.infer<typeof adminOrderEditRequestSchema>;
