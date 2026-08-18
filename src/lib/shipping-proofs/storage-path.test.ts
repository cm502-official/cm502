import { describe, expect, it } from "vitest";
import { buildProofStoragePath } from "./storage-path";

const ORDER_ID = "3fa85f64-5717-4562-b3fc-2c963f66afa6";

describe("buildProofStoragePath", () => {
  it("builds the documented path shape for an Instagram proof", () => {
    expect(buildProofStoragePath(ORDER_ID, "instagram_follow", "image/webp")).toBe(
      `orders/${ORDER_ID}/instagram/follow.webp`,
    );
  });

  it("builds the documented path shape for a TikTok proof", () => {
    expect(buildProofStoragePath(ORDER_ID, "tiktok_comment", "image/jpeg")).toBe(
      `orders/${ORDER_ID}/tiktok/comment.jpg`,
    );
  });

  it("is deterministic per (order, proof type) so a re-upload overwrites, never orphans", () => {
    const first = buildProofStoragePath(ORDER_ID, "instagram_like", "image/webp");
    const second = buildProofStoragePath(ORDER_ID, "instagram_like", "image/webp");
    expect(first).toBe(second);
  });

  it("never mixes up paths between two different orders", () => {
    const a = buildProofStoragePath("order-a", "tiktok_follow", "image/png");
    const b = buildProofStoragePath("order-b", "tiktok_follow", "image/png");
    expect(a).not.toBe(b);
  });
});
