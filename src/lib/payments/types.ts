/**
 * Provider-independent shape every OCR/slip-extraction adapter normalizes
 * into. Business logic (src/lib/payments/verify.ts) only ever sees this
 * shape — it never knows or cares which provider produced it. Amounts
 * are always integer satang (never a float, never a formatted string) —
 * providers are responsible for running raw OCR text through
 * `parseAmountToSatang` (src/lib/money.ts) before returning here.
 */
export interface NormalizedSlipResult {
  amountSatang: number | null;
  currency: string | null;
  transferredAt: string | null;
  senderName: string | null;
  senderAccount: string | null;
  receiverName: string | null;
  receiverAccount: string | null;
  bankName: string | null;
  transactionReference: string | null;
  /** Which adapter produced this — stored on payments.ocr_provider. */
  provider: string;
  /** 0..1, or null if the provider doesn't report one (treated as insufficient). */
  confidence: number | null;
  /** Opaque provider payload for audit trail — never sent to the customer. */
  rawResponse: unknown;
}

/**
 * PaymentSlipVerifier — the interface every slip-reading provider must
 * implement. Swapping providers means writing a new class here, never
 * touching the verification/finalization logic that consumes it.
 */
export interface PaymentSlipVerifier {
  verifySlip(imageBytes: Uint8Array, mimeType: string): Promise<NormalizedSlipResult>;
}
