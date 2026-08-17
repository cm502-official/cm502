import { describe, expect, it } from "vitest";
import { isReceiverMatch } from "./receiver-match";

const CONFIGURED = { bankName: "Kasikornbank", accountName: "CM502 Co., Ltd.", accountNumber: "123-4-56789-0" };

describe("isReceiverMatch", () => {
  it("returns null when no receiver is configured yet", () => {
    expect(isReceiverMatch(null, { receiverName: "CM502 Co., Ltd." })).toBeNull();
  });

  it("returns null when OCR extracted no receiver information at all", () => {
    expect(isReceiverMatch(CONFIGURED, {})).toBeNull();
  });

  it("matches on exact account number", () => {
    expect(isReceiverMatch(CONFIGURED, { receiverAccount: "1234567890" })).toBe(true);
  });

  it("matches a masked account number sharing a long common suffix", () => {
    expect(isReceiverMatch(CONFIGURED, { receiverAccount: "xxx-x-x6789-0" })).toBe(true);
  });

  it("matches on exact account name regardless of case/spacing", () => {
    expect(isReceiverMatch(CONFIGURED, { receiverName: "  cm502   CO., LTD.  " })).toBe(true);
  });

  it("returns false for a clearly different account number", () => {
    expect(isReceiverMatch(CONFIGURED, { receiverAccount: "9999999999" })).toBe(false);
  });

  it("returns false for a clearly different account name", () => {
    expect(isReceiverMatch(CONFIGURED, { receiverName: "Some Other Company Ltd." })).toBe(false);
  });

  it("does not reject solely because the bank name is missing on one side", () => {
    expect(isReceiverMatch(CONFIGURED, { receiverAccount: "1234567890", bankName: null })).toBe(true);
  });
});
