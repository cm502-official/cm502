import { describe, expect, it } from "vitest";
import { MAX_COMPRESSED_FILE_SIZE_BYTES } from "@/lib/media/image-compression";
import { validateProofFile } from "./file-validation";

const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const WEBP_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

function padded(header: Uint8Array, totalSize: number): Uint8Array {
  const out = new Uint8Array(totalSize);
  out.set(header);
  return out;
}

describe("validateProofFile", () => {
  it("accepts a valid compressed WEBP proof", () => {
    const result = validateProofFile(padded(WEBP_HEADER, 200 * 1024));
    expect(result).toEqual({ valid: true, mimeType: "image/webp" });
  });

  it("accepts a valid compressed JPEG proof (fallback format)", () => {
    const result = validateProofFile(padded(JPEG_HEADER, 200 * 1024));
    expect(result).toEqual({ valid: true, mimeType: "image/jpeg" });
  });

  it("rejects an empty file", () => {
    expect(validateProofFile(new Uint8Array())).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects a non-image byte stream (MIME/extension spoof)", () => {
    const html = new TextEncoder().encode("<html>not an image</html>");
    expect(validateProofFile(html)).toEqual({ valid: false, reason: "unsupported_format" });
  });

  it("rejects a file over the 1 MB compressed-output cap, even if the client claimed it was compressed", () => {
    const result = validateProofFile(padded(WEBP_HEADER, MAX_COMPRESSED_FILE_SIZE_BYTES + 1));
    expect(result).toEqual({ valid: false, reason: "too_large" });
  });

  it("accepts exactly at the 1 MB boundary", () => {
    const result = validateProofFile(padded(WEBP_HEADER, MAX_COMPRESSED_FILE_SIZE_BYTES));
    expect(result.valid).toBe(true);
  });
});
