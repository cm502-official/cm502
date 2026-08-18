/**
 * The 7 required social-proof categories for free shipping (§C/§E/§M).
 * Single source of truth shared by the checkout form (upload slots),
 * the upload API route (server-side validation of the proof_type it's
 * given), and the admin review UI (labels + completeness count) — so
 * the "exactly 7, exactly these categories" rule can never drift between
 * client and server.
 */
export const PROOF_PLATFORMS = ["instagram", "tiktok"] as const;
export type ProofPlatform = (typeof PROOF_PLATFORMS)[number];

export const PROOF_TYPES = [
  "instagram_follow",
  "instagram_like",
  "instagram_story_share",
  "tiktok_follow",
  "tiktok_like",
  "tiktok_repost",
  "tiktok_comment",
] as const;
export type ProofType = (typeof PROOF_TYPES)[number];

export const REQUIRED_PROOF_COUNT = PROOF_TYPES.length;

export interface ProofSlotConfig {
  proofType: ProofType;
  platform: ProofPlatform;
  label: string;
}

export const PROOF_SLOTS: ProofSlotConfig[] = [
  { proofType: "instagram_follow", platform: "instagram", label: "หลักฐาน Follow Instagram" },
  { proofType: "instagram_like", platform: "instagram", label: "หลักฐาน Like โพสต์ Instagram" },
  { proofType: "instagram_story_share", platform: "instagram", label: "หลักฐาน Share ลง Story" },
  { proofType: "tiktok_follow", platform: "tiktok", label: "หลักฐาน Follow TikTok" },
  { proofType: "tiktok_like", platform: "tiktok", label: "หลักฐาน Like โพสต์ TikTok" },
  { proofType: "tiktok_repost", platform: "tiktok", label: "หลักฐาน Repost TikTok" },
  { proofType: "tiktok_comment", platform: "tiktok", label: "หลักฐาน Comment TikTok" },
];

export function isProofType(value: string): value is ProofType {
  return (PROOF_TYPES as readonly string[]).includes(value);
}

export function getProofSlotConfig(proofType: ProofType): ProofSlotConfig {
  const config = PROOF_SLOTS.find((s) => s.proofType === proofType);
  if (!config) throw new RangeError(`Unknown proof type: ${proofType}`);
  return config;
}

/**
 * The server-trust boundary for "did the customer really supply all 7
 * required categories" (§Q) — takes whatever proof_type values actually
 * exist for an order (from the database, never from client-claimed
 * counts) and checks the set is exactly the 7 required ones. Duplicates
 * collapse via Set, so a re-uploaded/replaced category never counts
 * twice, and a wrong/unexpected category never counts toward the total.
 */
export function hasAllRequiredProofs(existingProofTypes: string[]): boolean {
  const present = new Set(existingProofTypes.filter(isProofType));
  return PROOF_TYPES.every((t) => present.has(t));
}

export function countValidProofs(existingProofTypes: string[]): number {
  const present = new Set(existingProofTypes.filter(isProofType));
  return present.size;
}
