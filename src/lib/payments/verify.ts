/**
 * The verification decision engine — the single place that turns a
 * normalized OCR result + order context into an outcome. Pure function,
 * no I/O, fully unit-testable. The atomic RPC (finalize_payment_verification,
 * 0008) independently re-checks the exact amount before trusting this —
 * this function is the primary decision, not the only line of defense.
 *
 * Deliberately conservative (§14/"Be conservative"): VERIFIED requires
 * every check to positively pass. Anything short of that — including
 * simply not having enough information — falls to needs_review rather
 * than being rejected. Only a check that actively DISAGREES (a real
 * mismatch, not just missing data) produces a rejection.
 */
import { satangEquals } from "@/lib/money";
import { isTransferTimeValid } from "./timestamp";
import { isReceiverMatch, type ConfiguredReceiver } from "./receiver-match";
import type { NormalizedSlipResult } from "./types";

export const MIN_CONFIDENCE_FOR_AUTO_VERIFY = 0.8;

export interface VerifyPaymentInput {
  expectedAmountSatang: number;
  orderCreatedAt: string;
  reservationExpiresAt: string | null;
  configuredReceiver: ConfiguredReceiver | null;
  slip: NormalizedSlipResult;
  now?: number;
}

export interface VerifyPaymentChecks {
  amountMatch: boolean | null;
  receiverMatch: boolean | null;
  timestampOk: boolean | null;
  confidenceSufficient: boolean;
}

export type VerifyPaymentOutcome = "verified" | "needs_review" | "rejected";

export interface VerifyPaymentResult {
  outcome: VerifyPaymentOutcome;
  checks: VerifyPaymentChecks;
  reason: string;
}

export function verifyPayment(input: VerifyPaymentInput): VerifyPaymentResult {
  const { slip } = input;

  const amountMatch =
    slip.amountSatang === null ? null : satangEquals(slip.amountSatang, input.expectedAmountSatang);

  const receiverMatch = isReceiverMatch(input.configuredReceiver, {
    bankName: slip.bankName,
    receiverName: slip.receiverName,
    receiverAccount: slip.receiverAccount,
  });

  const timestampOk = isTransferTimeValid({
    transferredAt: slip.transferredAt,
    orderCreatedAt: input.orderCreatedAt,
    reservationExpiresAt: input.reservationExpiresAt,
    now: input.now,
  });

  const confidenceSufficient = slip.confidence !== null && slip.confidence >= MIN_CONFIDENCE_FOR_AUTO_VERIFY;

  const checks: VerifyPaymentChecks = { amountMatch, receiverMatch, timestampOk, confidenceSufficient };

  // Definite disagreements → rejected. Never reject on missing/ambiguous
  // data alone (§11: "Do NOT automatically reject a genuine slip solely
  // because OCR could not extract it").
  if (amountMatch === false) {
    return { outcome: "rejected", checks, reason: "Detected amount does not match the order total." };
  }
  if (receiverMatch === false) {
    return { outcome: "rejected", checks, reason: "Detected receiver does not match CM502's payment destination." };
  }
  if (timestampOk === false) {
    return { outcome: "rejected", checks, reason: "Transfer time is outside the valid payment window." };
  }

  // Everything present and positive → verified.
  if (amountMatch === true && receiverMatch === true && timestampOk === true && confidenceSufficient) {
    return { outcome: "verified", checks, reason: "All checks passed with sufficient confidence." };
  }

  // Anything else (missing data, low confidence, ambiguous receiver) is
  // insufficient evidence either way — a failed/incomplete extraction is
  // not proof the customer didn't pay.
  return { outcome: "needs_review", checks, reason: "Insufficient evidence for automatic verification." };
}
