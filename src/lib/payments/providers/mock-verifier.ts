import type { NormalizedSlipResult, PaymentSlipVerifier } from "../types";

/**
 * Test/local-dev-only adapter. Deliberately extracts NOTHING — every
 * field is null, confidence is null. This is not a corner-cutting
 * shortcut: it's the only way to guarantee the mock can never produce a
 * 'verified' outcome (the decision engine in verify.ts requires a
 * non-null exact amount match, which this can never supply), satisfying
 * the hard requirement to never fake production verification. Its only
 * purpose is exercising the upload → storage → RPC pipeline end-to-end
 * in tests/local dev without calling a real external OCR API.
 */
export class MockPaymentSlipVerifier implements PaymentSlipVerifier {
  async verifySlip(imageBytes: Uint8Array): Promise<NormalizedSlipResult> {
    return {
      amountSatang: null,
      currency: null,
      transferredAt: null,
      senderName: null,
      senderAccount: null,
      receiverName: null,
      receiverAccount: null,
      bankName: null,
      transactionReference: null,
      provider: "mock",
      confidence: null,
      rawResponse: {
        note: "Mock provider — no real OCR performed. Always routes to needs_review.",
        byteLength: imageBytes.length,
      },
    };
  }
}
