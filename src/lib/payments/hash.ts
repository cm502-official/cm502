import "server-only";
import { createHash } from "node:crypto";

/** SHA-256 of the raw uploaded bytes — the primary duplicate-slip signal (§6). */
export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}
