import { describe, expect, it } from "vitest";
import { isOrderSafeForProductionExport } from "./order-eligibility";

describe("isOrderSafeForProductionExport", () => {
  it("is safe when verified and not cancelled", () => {
    expect(isOrderSafeForProductionExport("verified", "paid")).toBe(true);
    expect(isOrderSafeForProductionExport("verified", "processing")).toBe(true);
  });

  it("excludes cancelled orders even if payment is verified", () => {
    expect(isOrderSafeForProductionExport("verified", "cancelled")).toBe(false);
  });

  it("excludes unpaid/pending payment states", () => {
    expect(isOrderSafeForProductionExport("awaiting_payment", "pending_payment")).toBe(false);
    expect(isOrderSafeForProductionExport("slip_uploaded", "pending_payment")).toBe(false);
    expect(isOrderSafeForProductionExport("needs_review", "pending_payment")).toBe(false);
  });

  it("excludes rejected/duplicate/expired payment states", () => {
    expect(isOrderSafeForProductionExport("rejected", "pending_payment")).toBe(false);
    expect(isOrderSafeForProductionExport("duplicate_slip", "pending_payment")).toBe(false);
    expect(isOrderSafeForProductionExport("expired", "pending_payment")).toBe(false);
  });
});
