import { describe, expect, it } from "vitest";
import { MAX_SLIP_FILE_SIZE_BYTES, detectImageFormat, validateSlipFile } from "./file-validation";

const JPEG_HEADER = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
const PNG_HEADER = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
const WEBP_HEADER = new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);

describe("detectImageFormat", () => {
  it("recognizes a JPEG signature", () => {
    expect(detectImageFormat(JPEG_HEADER)).toBe("image/jpeg");
  });

  it("recognizes a PNG signature", () => {
    expect(detectImageFormat(PNG_HEADER)).toBe("image/png");
  });

  it("recognizes a WEBP signature", () => {
    expect(detectImageFormat(WEBP_HEADER)).toBe("image/webp");
  });

  it("returns null for an HTML file pretending to be an image (MIME spoof)", () => {
    const html = new TextEncoder().encode("<html><body>not an image</body></html>");
    expect(detectImageFormat(html)).toBeNull();
  });

  it("returns null for a truncated/too-short buffer", () => {
    expect(detectImageFormat(new Uint8Array([0xff, 0xd8]))).toBeNull();
  });

  it("returns null for an empty buffer", () => {
    expect(detectImageFormat(new Uint8Array())).toBeNull();
  });
});

describe("validateSlipFile", () => {
  it("accepts a valid JPEG", () => {
    expect(validateSlipFile(JPEG_HEADER)).toEqual({ valid: true, mimeType: "image/jpeg" });
  });

  it("accepts a valid PNG", () => {
    expect(validateSlipFile(PNG_HEADER)).toEqual({ valid: true, mimeType: "image/png" });
  });

  it("accepts a valid WEBP", () => {
    expect(validateSlipFile(WEBP_HEADER)).toEqual({ valid: true, mimeType: "image/webp" });
  });

  it("rejects an empty file", () => {
    expect(validateSlipFile(new Uint8Array())).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects an oversized file", () => {
    const oversized = new Uint8Array(MAX_SLIP_FILE_SIZE_BYTES + 1);
    oversized.set(JPEG_HEADER);
    expect(validateSlipFile(oversized)).toEqual({ valid: false, reason: "too_large" });
  });

  it("rejects an unsupported format", () => {
    const gif = new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61, 0, 0, 0, 0, 0, 0]);
    expect(validateSlipFile(gif)).toEqual({ valid: false, reason: "unsupported_format" });
  });

  it("rejects a MIME-spoofed file (claims image, is actually a script)", () => {
    const script = new TextEncoder().encode("#!/bin/sh\necho pwned\n");
    expect(validateSlipFile(script)).toEqual({ valid: false, reason: "unsupported_format" });
  });
});
