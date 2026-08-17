import "server-only";
import { getServerEnv } from "@/lib/env";
import type { PaymentSlipVerifier } from "./types";
import { MockPaymentSlipVerifier } from "./providers/mock-verifier";

/**
 * Provider factory. Returns null — never a fake verifier — when no real
 * OCR provider is wired up, so callers fail safe into `needs_review`
 * instead of skipping verification silently (§8).
 *
 * OCR_PROVIDER=mock is for local development and the test pipeline only;
 * it can never produce a 'verified' outcome (see MockPaymentSlipVerifier).
 *
 * OCR_PROVIDER=external is intentionally unimplemented as of Phase 4A —
 * no real Thai slip-OCR provider has been selected/configured yet. Even
 * with OCR_API_KEY/OCR_API_URL present, this returns null rather than
 * pretending to call something that isn't built. Wiring up a real
 * adapter is Phase 4B (see the final report's recommendation).
 */
export function getPaymentSlipVerifier(): PaymentSlipVerifier | null {
  let provider: string;
  try {
    provider = getServerEnv().OCR_PROVIDER;
  } catch {
    return null;
  }

  if (provider === "mock") {
    return new MockPaymentSlipVerifier();
  }

  return null;
}
