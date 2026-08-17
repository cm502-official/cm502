import "server-only";
import { randomUUID } from "node:crypto";
import type { AllowedSlipMimeType } from "./file-validation";

const EXTENSION_BY_MIME: Record<AllowedSlipMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Builds a server-generated, unguessable object path for a payment slip.
 * Never derived from customer input (filename, order number, or tracking
 * token) — only the internal order UUID (server-only, never sent to the
 * browser) plus a fresh random id, so a customer can never enumerate or
 * predict another order's slip path even if the bucket were misconfigured.
 */
export function buildSlipStoragePath(orderId: string, mimeType: AllowedSlipMimeType): string {
  return `orders/${orderId}/${randomUUID()}.${EXTENSION_BY_MIME[mimeType]}`;
}
