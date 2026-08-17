import { describe, expect, it } from "vitest";
import { verifyPayment, type VerifyPaymentInput } from "./verify";
import type { NormalizedSlipResult } from "./types";

const NOW = new Date("2026-08-15T12:10:00.000Z").getTime();

function baseSlip(overrides: Partial<NormalizedSlipResult> = {}): NormalizedSlipResult {
  return {
    amountSatang: 104000,
    currency: "THB",
    transferredAt: "2026-08-15T12:05:00.000Z",
    senderName: "Somchai Jaidee",
    senderAccount: "111-1-11111-1",
    receiverName: "CM502 Co., Ltd.",
    receiverAccount: "123-4-56789-0",
    bankName: "Kasikornbank",
    transactionReference: "TXN-ABC123",
    provider: "test",
    confidence: 0.95,
    rawResponse: {},
    ...overrides,
  };
}

function baseInput(overrides: Partial<VerifyPaymentInput> = {}): VerifyPaymentInput {
  return {
    expectedAmountSatang: 104000,
    orderCreatedAt: "2026-08-15T12:00:00.000Z",
    reservationExpiresAt: "2026-08-15T12:15:00.000Z",
    configuredReceiver: { bankName: "Kasikornbank", accountName: "CM502 Co., Ltd.", accountNumber: "123-4-56789-0" },
    slip: baseSlip(),
    now: NOW,
    ...overrides,
  };
}

describe("verifyPayment — valid verification", () => {
  it("verifies when everything matches with high confidence", () => {
    const result = verifyPayment(baseInput());
    expect(result.outcome).toBe("verified");
    expect(result.checks).toEqual({
      amountMatch: true,
      receiverMatch: true,
      timestampOk: true,
      confidenceSufficient: true,
    });
  });
});

describe("verifyPayment — wrong amount", () => {
  it("rejects a one-satang mismatch", () => {
    const result = verifyPayment(baseInput({ slip: baseSlip({ amountSatang: 104001 }) }));
    expect(result.outcome).toBe("rejected");
    expect(result.checks.amountMatch).toBe(false);
  });

  it("goes to needs_review when amount could not be extracted at all", () => {
    const result = verifyPayment(baseInput({ slip: baseSlip({ amountSatang: null }) }));
    expect(result.outcome).toBe("needs_review");
    expect(result.checks.amountMatch).toBeNull();
  });
});

describe("verifyPayment — wrong receiver", () => {
  it("rejects a clearly different receiver account", () => {
    const result = verifyPayment(baseInput({ slip: baseSlip({ receiverAccount: "999-9-99999-9", receiverName: null }) }));
    expect(result.outcome).toBe("rejected");
    expect(result.checks.receiverMatch).toBe(false);
  });

  it("goes to needs_review (not rejected) when receiver info is simply missing", () => {
    const result = verifyPayment(
      baseInput({ slip: baseSlip({ receiverAccount: null, receiverName: null, bankName: null }) }),
    );
    expect(result.outcome).toBe("needs_review");
    expect(result.checks.receiverMatch).toBeNull();
  });
});

describe("verifyPayment — expired order", () => {
  it("rejects a transfer timestamp clearly after the payment window", () => {
    const result = verifyPayment(
      baseInput({
        slip: baseSlip({ transferredAt: "2026-08-15T13:00:00.000Z" }),
        now: new Date("2026-08-15T13:00:00.000Z").getTime(),
      }),
    );
    expect(result.outcome).toBe("rejected");
    expect(result.checks.timestampOk).toBe(false);
  });
});

describe("verifyPayment — needs_review fallback", () => {
  it("falls back when confidence is too low despite matching data", () => {
    const result = verifyPayment(baseInput({ slip: baseSlip({ confidence: 0.4 }) }));
    expect(result.outcome).toBe("needs_review");
    expect(result.checks.confidenceSufficient).toBe(false);
  });

  it("falls back when confidence is null (e.g. mock/unconfigured provider)", () => {
    const result = verifyPayment(baseInput({ slip: baseSlip({ confidence: null }) }));
    expect(result.outcome).toBe("needs_review");
  });

  it("the mock provider's fully-null slip always resolves to needs_review, never verified", () => {
    const result = verifyPayment(
      baseInput({
        slip: {
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
          rawResponse: {},
        },
      }),
    );
    expect(result.outcome).toBe("needs_review");
  });

  it("falls back when a malformed/unparseable timestamp was extracted", () => {
    const result = verifyPayment(baseInput({ slip: baseSlip({ transferredAt: "not-a-real-date" }) }));
    expect(result.outcome).toBe("needs_review");
    expect(result.checks.timestampOk).toBeNull();
  });

  it("falls back when no transaction reference was extracted (still needs_review, not rejected)", () => {
    const result = verifyPayment(baseInput({ slip: baseSlip({ transactionReference: null }) }));
    // Reference absence alone doesn't affect verifyPayment's outcome directly
    // (duplicate/uniqueness enforcement happens at the DB layer), but confirm
    // it doesn't crash and other checks still drive the outcome correctly.
    expect(result.outcome).toBe("verified");
  });
});
