import { describe, expect, it } from "vitest";
import { isTransferTimeValid } from "./timestamp";

const ORDER_CREATED = "2026-08-15T12:00:00.000Z";
const RESERVATION_EXPIRES = "2026-08-15T12:15:00.000Z";
const NOW = new Date("2026-08-15T12:10:00.000Z").getTime();

describe("isTransferTimeValid", () => {
  it("accepts a transfer time within the order window", () => {
    expect(
      isTransferTimeValid({
        transferredAt: "2026-08-15T12:05:00.000Z",
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: RESERVATION_EXPIRES,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("returns null when transferredAt is missing", () => {
    expect(
      isTransferTimeValid({
        transferredAt: null,
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: RESERVATION_EXPIRES,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("returns null for a malformed timestamp, never throws", () => {
    expect(() =>
      isTransferTimeValid({
        transferredAt: "not-a-date",
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: RESERVATION_EXPIRES,
        now: NOW,
      }),
    ).not.toThrow();
    expect(
      isTransferTimeValid({
        transferredAt: "not-a-date",
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: RESERVATION_EXPIRES,
        now: NOW,
      }),
    ).toBeNull();
  });

  it("rejects a transfer clearly before order creation", () => {
    expect(
      isTransferTimeValid({
        transferredAt: "2026-08-15T10:00:00.000Z", // 2 hours before
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: RESERVATION_EXPIRES,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("rejects a transfer clearly after the payment window closed", () => {
    expect(
      isTransferTimeValid({
        transferredAt: "2026-08-15T13:00:00.000Z", // 45 min after expiry
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: RESERVATION_EXPIRES,
        now: new Date("2026-08-15T13:00:00.000Z").getTime(),
      }),
    ).toBe(false);
  });

  it("rejects a transfer time far in the future beyond clock skew", () => {
    expect(
      isTransferTimeValid({
        transferredAt: "2026-08-15T14:00:00.000Z",
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: RESERVATION_EXPIRES,
        now: NOW,
      }),
    ).toBe(false);
  });

  it("tolerates small clock skew right at order creation", () => {
    expect(
      isTransferTimeValid({
        transferredAt: "2026-08-15T11:58:00.000Z", // 2 min before, within 5 min skew
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: RESERVATION_EXPIRES,
        now: NOW,
      }),
    ).toBe(true);
  });

  it("tolerates small clock skew right at reservation expiry", () => {
    expect(
      isTransferTimeValid({
        transferredAt: "2026-08-15T12:17:00.000Z", // 2 min after expiry, within skew
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: RESERVATION_EXPIRES,
        now: new Date("2026-08-15T12:17:00.000Z").getTime(),
      }),
    ).toBe(true);
  });

  it("works without a reservation deadline (only checks against order creation/now)", () => {
    expect(
      isTransferTimeValid({
        transferredAt: "2026-08-15T12:05:00.000Z",
        orderCreatedAt: ORDER_CREATED,
        reservationExpiresAt: null,
        now: NOW,
      }),
    ).toBe(true);
  });
});
