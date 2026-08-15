import { z } from "zod";
import { phoneSchema } from "./checkout";

/** Matches generate_order_number() in 0001_init.sql: CM502-YYYYMMDD-NNNN. */
export const orderNumberSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^CM502-\d{8}-\d{4}$/, "Enter a valid order number, e.g. CM502-20260815-0001");

export const trackOrderRequestSchema = z.object({
  orderNumber: orderNumberSchema,
  phone: phoneSchema,
});

export type TrackOrderRequest = z.infer<typeof trackOrderRequestSchema>;
