import "server-only";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerEnv } from "@/lib/env";
import { getProofSlotConfig, isProofType, type ProofType } from "@/lib/shipping-proofs/proof-types";
import type { ProductionSourceItem } from "./flatten-production-list";

export interface AdminOrderProof {
  proofType: ProofType;
  label: string;
  platform: string;
  fileSizeBytes: number;
  mimeType: string;
  createdAt: string;
  /** Short-lived signed URL (§AB) — never persisted, generated fresh per page load. Null if signing failed. */
  signedUrl: string | null;
}

export interface AdminOrderDetail {
  orderNumber: string;
  customerName: string | null;
  customerPhone: string | null;
  paymentStatus: string;
  fulfillmentStatus: string;
  totalQuantity: number;
  unitPriceSatang: number | null;
  subtotalSatang: number;
  shippingFeeSatang: number;
  totalSatang: number;
  createdAt: string;
  shippingMethodName: string | null;
  shippingAddress: {
    addressLine: string;
    subdistrict: string;
    district: string;
    province: string;
    postalCode: string;
  } | null;
  productionItems: ProductionSourceItem[];
  // §O — only populated for orders that chose free_social_proof.
  shippingChoice: string;
  proofReviewStatus: string | null;
  proofReviewReason: string | null;
  proofReviewedAt: string | null;
  proofs: AdminOrderProof[];
}

const SIGNED_URL_EXPIRES_SECONDS = 10 * 60; // 10 minutes — long enough to review one order, short-lived by design (§Z)

/** Single order, full detail, for /admin/orders/[orderNumber] (§ admin production visibility + §O free-shipping proof review). */
export async function getAdminOrderDetail(orderNumber: string): Promise<AdminOrderDetail | null> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("orders")
    .select(
      `
      order_number, payment_status, fulfillment_status,
      subtotal_satang, shipping_fee_satang, total_satang, created_at,
      shipping_choice, proof_review_status, proof_review_reason, proof_reviewed_at,
      shipping_methods ( name ),
      addresses ( address_line, subdistrict, district, province, postal_code ),
      customers ( full_name, phone ),
      order_items ( color_name_snapshot, size_name_snapshot, quantity, unit_price_satang, customizations ),
      order_shipping_proofs ( proof_type, platform, storage_path, file_size_bytes, mime_type, created_at )
    `,
    )
    .eq("order_number", orderNumber)
    .maybeSingle();

  if (error || !data) return null;

  const row = data as unknown as {
    order_number: string;
    payment_status: string;
    fulfillment_status: string;
    subtotal_satang: number;
    shipping_fee_satang: number;
    total_satang: number;
    created_at: string;
    shipping_choice: string;
    proof_review_status: string | null;
    proof_review_reason: string | null;
    proof_reviewed_at: string | null;
    shipping_methods: { name: string } | null;
    addresses: {
      address_line: string;
      subdistrict: string;
      district: string;
      province: string;
      postal_code: string;
    } | null;
    customers: { full_name: string; phone: string } | null;
    order_items: Array<{
      color_name_snapshot: string;
      size_name_snapshot: string;
      quantity: number;
      unit_price_satang: number;
      customizations: Array<{ name: string | null; number: string | null }> | null;
    }>;
    order_shipping_proofs: Array<{
      proof_type: string;
      platform: string;
      storage_path: string;
      file_size_bytes: number;
      mime_type: string;
      created_at: string;
    }>;
  };

  const proofs = await buildSignedProofs(row.order_shipping_proofs ?? []);

  return {
    orderNumber: row.order_number,
    customerName: row.customers?.full_name ?? null,
    customerPhone: row.customers?.phone ?? null,
    paymentStatus: row.payment_status,
    fulfillmentStatus: row.fulfillment_status,
    totalQuantity: row.order_items.reduce((sum, i) => sum + i.quantity, 0),
    unitPriceSatang: row.order_items[0]?.unit_price_satang ?? null,
    subtotalSatang: row.subtotal_satang,
    shippingFeeSatang: row.shipping_fee_satang,
    totalSatang: row.total_satang,
    createdAt: row.created_at,
    shippingMethodName: row.shipping_methods?.name ?? null,
    shippingAddress: row.addresses
      ? {
          addressLine: row.addresses.address_line,
          subdistrict: row.addresses.subdistrict,
          district: row.addresses.district,
          province: row.addresses.province,
          postalCode: row.addresses.postal_code,
        }
      : null,
    productionItems: row.order_items.map((i) => ({
      colorNameSnapshot: i.color_name_snapshot,
      sizeNameSnapshot: i.size_name_snapshot,
      customizations: i.customizations,
    })),
    shippingChoice: row.shipping_choice,
    proofReviewStatus: row.proof_review_status,
    proofReviewReason: row.proof_review_reason,
    proofReviewedAt: row.proof_reviewed_at,
    proofs,
  };
}

/**
 * Signed URLs (§AB) must come from the service-role client — the
 * shipping-proofs bucket deliberately has no storage.objects policy for
 * the authenticated/admin session role (same model as payment-slips,
 * §0003_storage.sql), so only the server-only service-role client can
 * mint them. Table metadata (proof_type, storage_path, etc.) was already
 * read above via the RLS-scoped session client — this step only touches
 * Storage, never re-reads order data with elevated privilege.
 */
async function buildSignedProofs(
  rows: Array<{
    proof_type: string;
    platform: string;
    storage_path: string;
    file_size_bytes: number;
    mime_type: string;
    created_at: string;
  }>,
): Promise<AdminOrderProof[]> {
  if (rows.length === 0) return [];

  let admin;
  let bucket = "shipping-proofs";
  try {
    admin = createAdminClient();
    bucket = getServerEnv().SUPABASE_STORAGE_SHIPPING_PROOFS_BUCKET;
  } catch {
    admin = null;
  }

  const results: AdminOrderProof[] = [];
  for (const row of rows) {
    if (!isProofType(row.proof_type)) continue; // defensive — ignore any row that isn't a known category
    const { label, platform } = getProofSlotConfig(row.proof_type);

    let signedUrl: string | null = null;
    if (admin) {
      const { data: signed } = await admin.storage
        .from(bucket)
        .createSignedUrl(row.storage_path, SIGNED_URL_EXPIRES_SECONDS);
      signedUrl = signed?.signedUrl ?? null;
    }

    results.push({
      proofType: row.proof_type,
      label,
      platform,
      fileSizeBytes: row.file_size_bytes,
      mimeType: row.mime_type,
      createdAt: row.created_at,
      signedUrl,
    });
  }

  return results;
}
