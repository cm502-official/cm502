import { NextResponse } from "next/server";
import { z } from "zod";
import { getAdminUserOrNull } from "@/lib/admin/require-admin";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/admin/orders/[orderNumber]/proof-review
 *
 * §O/§P — an admin manually approves or rejects the 7 uploaded proof
 * screenshots for a free-shipping order. Never auto-approves (§N — no
 * OCR/AI here), never deletes the proofs on rejection (§O), and never
 * triggers any payment adjustment (§P) — this endpoint only records a
 * review decision for the admin dashboard/customer-facing status line
 * to display.
 *
 * Uses the RLS-scoped session client (not the service-role client) —
 * `orders_admin_only` (0002_rls.sql) already permits an authenticated
 * admin session to update `orders`, so this stays consistent with how
 * every other admin read already works, and Postgres RLS is the actual
 * enforcement layer, not just the getAdminUserOrNull() check above it
 * (defense in depth, same rationale as requireAdminUser's doc comment).
 */
const reviewRequestSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  reason: z.string().trim().max(500).optional().or(z.literal("")).transform((v) => (v ? v : null)),
});

export async function POST(request: Request, { params }: { params: Promise<{ orderNumber: string }> }) {
  const admin = await getAdminUserOrNull();
  if (!admin) {
    return NextResponse.json({ error: { code: "UNAUTHORIZED", message: "Not authorized" } }, { status: 401 });
  }

  const { orderNumber } = await params;

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request" } }, { status: 400 });
  }

  const parsed = reviewRequestSchema.safeParse(rawBody);
  if (!parsed.success) {
    return NextResponse.json({ error: { code: "VALIDATION_ERROR", message: "Invalid request" } }, { status: 400 });
  }

  const supabase = await createClient();

  // Only ever applies to orders that actually opted into the free-proof
  // promotion — an .eq on shipping_choice here means a mistaken/forged
  // request against a paid_shipping order silently matches zero rows
  // instead of ever writing garbage review state onto it.
  const { data, error } = await supabase
    .from("orders")
    .update({
      proof_review_status: parsed.data.decision,
      proof_review_reason: parsed.data.decision === "rejected" ? parsed.data.reason : null,
      proof_reviewed_at: new Date().toISOString(),
      proof_reviewed_by: admin.id,
    })
    .eq("order_number", orderNumber)
    .eq("shipping_choice", "free_social_proof")
    .select("order_number, proof_review_status")
    .maybeSingle();

  if (error) {
    console.error("[admin/proof-review] update failed:", error);
    return NextResponse.json({ error: { code: "UPDATE_FAILED", message: "Update failed" } }, { status: 502 });
  }
  if (!data) {
    return NextResponse.json({ error: { code: "NOT_FOUND", message: "Order not found" } }, { status: 404 });
  }

  return NextResponse.json({ orderNumber: data.order_number, proofReviewStatus: data.proof_review_status });
}
