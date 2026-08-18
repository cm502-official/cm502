import "server-only";
import type { AllowedSlipMimeType } from "@/lib/payments/file-validation";
import type { ProofType } from "./proof-types";
import { getProofSlotConfig } from "./proof-types";

const EXTENSION_BY_MIME: Record<AllowedSlipMimeType, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

/**
 * Server-generated object path (§I): `orders/{order-id}/{platform}/
 * {proof_type}.{ext}` — derived only from the internal order UUID
 * (never sent to the browser) and the fixed, server-validated proof
 * type, never from customer input. Deliberately deterministic per
 * (order, proof_type) — re-uploading the same category overwrites its
 * own object (upsert), never accumulates orphaned duplicates.
 */
export function buildProofStoragePath(orderId: string, proofType: ProofType, mimeType: AllowedSlipMimeType): string {
  const { platform } = getProofSlotConfig(proofType);
  const shortType = proofType.replace(`${platform}_`, "");
  return `orders/${orderId}/${platform}/${shortType}.${EXTENSION_BY_MIME[mimeType]}`;
}
