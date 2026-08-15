import { describe, expect, it } from "vitest";
import {
  formatCountdown,
  getCountdownState,
  getFulfillmentStatusLabel,
  getPaymentStatusLabel,
  isOrderPayable,
  isReservationExpired,
} from "./lifecycle";

describe("status label mapping", () => {
  it("never returns a raw enum value for known statuses", () => {
    expect(getPaymentStatusLabel("awaiting_payment")).toBe("Awaiting payment");
    expect(getPaymentStatusLabel("duplicate_slip")).not.toBe("duplicate_slip");
    expect(getPaymentStatusLabel("duplicate_slip")).toBe("Payment flagged — contact support");
    expect(getFulfillmentStatusLabel("pending_payment")).toBe("Pending payment");
  });

  it("falls back safely for an unrecognized status instead of throwing", () => {
    expect(getPaymentStatusLabel("something_new")).toBe("Unknown status");
    expect(getFulfillmentStatusLabel("something_new")).toBe("Unknown status");
  });
});

describe("isReservationExpired", () => {
  const future = new Date(Date.now() + 60_000).toISOString();
  const past = new Date(Date.now() - 60_000).toISOString();

  it("is false for a future deadline", () => {
    expect(isReservationExpired({ paymentStatus: "awaiting_payment", reservationExpiresAt: future })).toBe(false);
  });

  it("is true for a past deadline while still awaiting_payment", () => {
    expect(isReservationExpired({ paymentStatus: "awaiting_payment", reservationExpiresAt: past })).toBe(true);
  });

  it("is false once payment has moved past awaiting_payment, even with a past deadline", () => {
    expect(isReservationExpired({ paymentStatus: "verified", reservationExpiresAt: past })).toBe(false);
    expect(isReservationExpired({ paymentStatus: "expired", reservationExpiresAt: past })).toBe(false);
  });

  it("is false with no deadline set", () => {
    expect(isReservationExpired({ paymentStatus: "awaiting_payment", reservationExpiresAt: null })).toBe(false);
  });

  it("is false (fails safe) for a malformed timestamp", () => {
    expect(
      isReservationExpired({ paymentStatus: "awaiting_payment", reservationExpiresAt: "not-a-date" }),
    ).toBe(false);
  });
});

describe("isOrderPayable", () => {
  it("is true while awaiting payment with time remaining", () => {
    const future = new Date(Date.now() + 60_000).toISOString();
    expect(isOrderPayable({ paymentStatus: "awaiting_payment", reservationExpiresAt: future })).toBe(true);
  });

  it("is false once the reservation has expired", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(isOrderPayable({ paymentStatus: "awaiting_payment", reservationExpiresAt: past })).toBe(false);
  });

  it("is false for any non-awaiting_payment status", () => {
    expect(isOrderPayable({ paymentStatus: "verified", reservationExpiresAt: null })).toBe(false);
  });
});

describe("getCountdownState", () => {
  it("reports counting for a future timestamp", () => {
    const state = getCountdownState(new Date(Date.now() + 5000).toISOString());
    expect(state.status).toBe("counting");
    if (state.status === "counting") {
      expect(state.remainingMs).toBeGreaterThan(0);
      expect(state.remainingMs).toBeLessThanOrEqual(5000);
    }
  });

  it("reports expired for a past timestamp", () => {
    expect(getCountdownState(new Date(Date.now() - 5000).toISOString())).toEqual({ status: "expired" });
  });

  it("reports expired exactly at the boundary (now === expiresAt)", () => {
    const now = Date.now();
    expect(getCountdownState(new Date(now).toISOString(), now)).toEqual({ status: "expired" });
  });

  it("reports no-deadline for null", () => {
    expect(getCountdownState(null)).toEqual({ status: "no-deadline" });
  });

  it("reports invalid for a malformed timestamp, never throws", () => {
    expect(() => getCountdownState("not-a-real-date")).not.toThrow();
    expect(getCountdownState("not-a-real-date")).toEqual({ status: "invalid" });
    expect(getCountdownState("")).toEqual({ status: "no-deadline" });
  });
});

describe("formatCountdown", () => {
  it("formats minutes and seconds", () => {
    expect(formatCountdown(90_000)).toBe("01:30");
    expect(formatCountdown(5_000)).toBe("00:05");
  });

  it("formats hours when over 60 minutes", () => {
    expect(formatCountdown(3_661_000)).toBe("1:01:01");
  });

  it("never goes negative", () => {
    expect(formatCountdown(-5000)).toBe("00:00");
  });
});
