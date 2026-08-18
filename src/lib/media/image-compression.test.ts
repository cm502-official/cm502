import { describe, expect, it } from "vitest";
import {
  ImageCompressionError,
  MAX_COMPRESSED_FILE_SIZE_BYTES,
  MAX_ORIGINAL_FILE_SIZE_BYTES,
  TARGET_COMPRESSED_FILE_SIZE_BYTES,
  TARGET_LONGEST_EDGE_PX,
  compressProofImage,
  computeResizedDimensions,
  nextQuality,
  validateCompressedOutput,
  validateOriginalFile,
  type CanvasLike,
} from "./image-compression";

function bytesOfSize(size: number): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(size));
}

describe("validateOriginalFile", () => {
  it("accepts a valid JPEG/PNG/WEBP within the size cap", () => {
    expect(validateOriginalFile(2_000_000, "image/jpeg")).toEqual({ valid: true });
    expect(validateOriginalFile(2_000_000, "image/png")).toEqual({ valid: true });
    expect(validateOriginalFile(2_000_000, "image/webp")).toEqual({ valid: true });
  });

  it("rejects an unsupported format (e.g. HEIC)", () => {
    expect(validateOriginalFile(2_000_000, "image/heic")).toEqual({
      valid: false,
      reason: "unsupported_format",
    });
  });

  it("rejects an empty file", () => {
    expect(validateOriginalFile(0, "image/jpeg")).toEqual({ valid: false, reason: "empty" });
  });

  it("rejects an absurdly large input (> 15 MB)", () => {
    expect(validateOriginalFile(MAX_ORIGINAL_FILE_SIZE_BYTES + 1, "image/jpeg")).toEqual({
      valid: false,
      reason: "too_large",
    });
  });

  it("accepts exactly at the size boundary", () => {
    expect(validateOriginalFile(MAX_ORIGINAL_FILE_SIZE_BYTES, "image/jpeg")).toEqual({ valid: true });
  });
});

describe("computeResizedDimensions", () => {
  it("resizes the longest edge down to the target, preserving aspect ratio", () => {
    const result = computeResizedDimensions({ width: 2400, height: 1200 }, TARGET_LONGEST_EDGE_PX);
    expect(result).toEqual({ width: 1200, height: 600 });
  });

  it("resizes correctly for a portrait screenshot (typical Instagram/TikTok proof shape)", () => {
    const result = computeResizedDimensions({ width: 1080, height: 2340 }, TARGET_LONGEST_EDGE_PX);
    expect(result.height).toBe(1200);
    // aspect ratio preserved within rounding
    expect(Math.abs(result.width / result.height - 1080 / 2340)).toBeLessThan(0.001);
  });

  it("never upscales an image already smaller than the target", () => {
    const result = computeResizedDimensions({ width: 800, height: 600 }, TARGET_LONGEST_EDGE_PX);
    expect(result).toEqual({ width: 800, height: 600 });
  });

  it("handles an exact-boundary image unchanged", () => {
    const result = computeResizedDimensions({ width: 1200, height: 900 }, TARGET_LONGEST_EDGE_PX);
    expect(result).toEqual({ width: 1200, height: 900 });
  });

  it("throws on invalid (zero/negative) source dimensions", () => {
    expect(() => computeResizedDimensions({ width: 0, height: 100 }, 1200)).toThrow(RangeError);
    expect(() => computeResizedDimensions({ width: 100, height: -1 }, 1200)).toThrow(RangeError);
  });
});

describe("nextQuality", () => {
  it("steps down by the configured increment", () => {
    expect(nextQuality(0.65)).toBeCloseTo(0.55);
  });

  it("stops (returns null) once the next step would cross the floor", () => {
    expect(nextQuality(0.4)).toBeNull();
    expect(nextQuality(0.45)).toBeNull(); // 0.45 - 0.1 = 0.35, which is below MIN_QUALITY (0.4)
  });

  it("keeps stepping while still at or above the floor", () => {
    expect(nextQuality(0.5)).toBeCloseTo(0.4);
  });
});

describe("validateCompressedOutput", () => {
  it("accepts output within the 1 MB hard cap", () => {
    expect(validateCompressedOutput(MAX_COMPRESSED_FILE_SIZE_BYTES)).toEqual({ valid: true });
    expect(validateCompressedOutput(300 * 1024)).toEqual({ valid: true });
  });

  it("rejects output over the 1 MB hard cap even after every quality step", () => {
    expect(validateCompressedOutput(MAX_COMPRESSED_FILE_SIZE_BYTES + 1)).toEqual({
      valid: false,
      reason: "too_large_after_compression",
    });
  });
});

// ── compressProofImage orchestration (deps injected — no real canvas/Image
// needed, matching this project's Node-only Vitest environment) ──────────

function fakeCanvasReturning(blobs: Array<{ size: number; type: string } | null>): CanvasLike {
  let call = 0;
  return {
    width: 0,
    height: 0,
    getContext: () => ({ drawImage: () => {} }),
    toBlob: (callback, type, _quality) => {
      const spec = blobs[Math.min(call, blobs.length - 1)];
      call += 1;
      if (!spec) {
        callback(null);
        return;
      }
      callback(new Blob([bytesOfSize(spec.size)], { type: spec.type ?? type }));
    },
  };
}

const fakeBitmap = { width: 2400, height: 1600 };

describe("compressProofImage", () => {
  it("compresses at the initial quality when the first attempt is already under the soft target", async () => {
    const file = new File([bytesOfSize(5_000_000)], "shot.jpg", { type: "image/jpeg" });
    const canvas = fakeCanvasReturning([{ size: 150 * 1024, type: "image/webp" }]);

    const result = await compressProofImage(file, {
      loadBitmap: async () => fakeBitmap,
      createCanvas: () => canvas,
    });

    expect(result.metadata.mimeType).toBe("image/webp");
    expect(result.metadata.sizeBytes).toBe(150 * 1024);
    expect(result.metadata.width).toBe(1200);
    expect(result.metadata.height).toBe(800);
  });

  it("steps quality down progressively until under the soft target", async () => {
    const file = new File([bytesOfSize(5_000_000)], "shot.jpg", { type: "image/jpeg" });
    // First attempt too big, second attempt lands under the soft target.
    const canvas = fakeCanvasReturning([
      { size: 500 * 1024, type: "image/webp" },
      { size: 200 * 1024, type: "image/webp" },
    ]);

    const result = await compressProofImage(file, {
      loadBitmap: async () => fakeBitmap,
      createCanvas: () => canvas,
    });

    expect(result.metadata.sizeBytes).toBe(200 * 1024);
  });

  it("falls back to JPEG when the browser silently can't encode WebP", async () => {
    const file = new File([bytesOfSize(5_000_000)], "shot.png", { type: "image/png" });
    // First call requests webp but the canvas returns a png blob (silent
    // fallback) — the encoder should detect this and retry as JPEG.
    const canvas = fakeCanvasReturning([
      { size: 900 * 1024, type: "image/png" },
      { size: 180 * 1024, type: "image/jpeg" },
    ]);

    const result = await compressProofImage(file, {
      loadBitmap: async () => fakeBitmap,
      createCanvas: () => canvas,
    });

    expect(result.metadata.mimeType).toBe("image/jpeg");
    expect(result.metadata.sizeBytes).toBe(180 * 1024);
  });

  it("rejects an oversized original before ever touching the canvas", async () => {
    const file = new File([bytesOfSize(MAX_ORIGINAL_FILE_SIZE_BYTES + 1)], "huge.jpg", { type: "image/jpeg" });
    let canvasTouched = false;

    await expect(
      compressProofImage(file, {
        loadBitmap: async () => {
          canvasTouched = true;
          return fakeBitmap;
        },
        createCanvas: () => fakeCanvasReturning([{ size: 100, type: "image/webp" }]),
      }),
    ).rejects.toThrow(ImageCompressionError);
    expect(canvasTouched).toBe(false);
  });

  it("rejects an unsupported source format before touching the canvas", async () => {
    const file = new File([bytesOfSize(1000)], "shot.heic", { type: "image/heic" });
    await expect(
      compressProofImage(file, {
        loadBitmap: async () => fakeBitmap,
        createCanvas: () => fakeCanvasReturning([{ size: 100, type: "image/webp" }]),
      }),
    ).rejects.toMatchObject({ reason: "unsupported_format" });
  });

  it("throws if even the lowest quality still exceeds the 1 MB hard cap", async () => {
    const file = new File([bytesOfSize(5_000_000)], "shot.jpg", { type: "image/jpeg" });
    // Every attempt (quality 0.65 down to 0.4) stays oversized.
    const canvas = fakeCanvasReturning([
      { size: 1.5 * 1024 * 1024, type: "image/webp" },
      { size: 1.4 * 1024 * 1024, type: "image/webp" },
      { size: 1.3 * 1024 * 1024, type: "image/webp" },
    ]);

    await expect(
      compressProofImage(file, {
        loadBitmap: async () => fakeBitmap,
        createCanvas: () => canvas,
      }),
    ).rejects.toMatchObject({ reason: "too_large_after_compression" });
  });
});
