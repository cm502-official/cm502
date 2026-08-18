import { describe, expect, it } from "vitest";
import {
  PROOF_SLOTS,
  PROOF_TYPES,
  REQUIRED_PROOF_COUNT,
  countValidProofs,
  getProofSlotConfig,
  hasAllRequiredProofs,
  isProofType,
} from "./proof-types";

describe("PROOF_TYPES / PROOF_SLOTS", () => {
  it("has exactly 7 required proof categories", () => {
    expect(PROOF_TYPES.length).toBe(7);
    expect(REQUIRED_PROOF_COUNT).toBe(7);
  });

  it("has a slot config (with a Thai label) for every proof type, in matching order", () => {
    expect(PROOF_SLOTS.map((s) => s.proofType)).toEqual(PROOF_TYPES);
    for (const slot of PROOF_SLOTS) {
      expect(slot.label.length).toBeGreaterThan(0);
    }
  });

  it("splits 3 Instagram + 4 TikTok proofs", () => {
    expect(PROOF_SLOTS.filter((s) => s.platform === "instagram")).toHaveLength(3);
    expect(PROOF_SLOTS.filter((s) => s.platform === "tiktok")).toHaveLength(4);
  });
});

describe("isProofType", () => {
  it("accepts every real proof type", () => {
    for (const t of PROOF_TYPES) expect(isProofType(t)).toBe(true);
  });

  it("rejects an unrelated/garbage string", () => {
    expect(isProofType("instagram_comment")).toBe(false);
    expect(isProofType("")).toBe(false);
    expect(isProofType("tiktok_share")).toBe(false);
  });
});

describe("getProofSlotConfig", () => {
  it("returns the right label for a known type", () => {
    expect(getProofSlotConfig("instagram_follow").label).toBe("หลักฐาน Follow Instagram");
    expect(getProofSlotConfig("tiktok_comment").label).toBe("หลักฐาน Comment TikTok");
  });
});

describe("hasAllRequiredProofs — the server trust boundary for free-shipping completeness", () => {
  it("rejects 0/7", () => {
    expect(hasAllRequiredProofs([])).toBe(false);
  });

  it("rejects 1-6/7", () => {
    expect(hasAllRequiredProofs(["instagram_follow"])).toBe(false);
    expect(hasAllRequiredProofs(PROOF_TYPES.slice(0, 6))).toBe(false);
  });

  it("accepts exactly 7/7", () => {
    expect(hasAllRequiredProofs([...PROOF_TYPES])).toBe(true);
  });

  it("a duplicate proof type does not count twice toward completeness", () => {
    const withDuplicate = [...PROOF_TYPES.slice(0, 6), "instagram_follow", "instagram_follow"];
    // Still missing tiktok_comment (7th distinct type) despite 8 entries.
    expect(hasAllRequiredProofs(withDuplicate)).toBe(false);
  });

  it("a wrong/unexpected category is ignored, not counted toward the 7", () => {
    const withGarbage = [...PROOF_TYPES.slice(0, 6), "instagram_comment"];
    expect(hasAllRequiredProofs(withGarbage)).toBe(false);
  });
});

describe("countValidProofs", () => {
  it("counts distinct valid proof types only", () => {
    expect(countValidProofs([])).toBe(0);
    expect(countValidProofs(["instagram_follow"])).toBe(1);
    expect(countValidProofs(["instagram_follow", "instagram_follow"])).toBe(1);
    expect(countValidProofs([...PROOF_TYPES])).toBe(7);
    expect(countValidProofs([...PROOF_TYPES, "bogus_type"])).toBe(7);
  });
});
