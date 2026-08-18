/**
 * Client-side screenshot compression for social-proof uploads (§F).
 *
 * Pure, framework-agnostic helpers are exported separately from the
 * browser-only orchestrator so the interesting logic (resize math,
 * progressive-quality stepping, validation) is unit-testable under
 * Vitest's plain Node environment — this project has no jsdom/canvas
 * available in tests, so `compressProofImage` itself (which touches
 * `createImageBitmap`/`<canvas>`) is intentionally thin and untested,
 * exactly like the browser-only glue elsewhere in the codebase.
 */

export const MAX_ORIGINAL_FILE_SIZE_BYTES = 15 * 1024 * 1024; // 15 MB — reject absurd input before touching it at all
export const MAX_COMPRESSED_FILE_SIZE_BYTES = 1 * 1024 * 1024; // 1 MB hard cap on the output
export const TARGET_COMPRESSED_FILE_SIZE_BYTES = 300 * 1024; // soft target — stop stepping down once under this
export const TARGET_LONGEST_EDGE_PX = 1200;
export const INITIAL_QUALITY = 0.65;
export const MIN_QUALITY = 0.4;
export const QUALITY_STEP = 0.1;

export const ACCEPTED_SOURCE_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type AcceptedSourceMimeType = (typeof ACCEPTED_SOURCE_MIME_TYPES)[number];

export interface ImageDimensions {
  width: number;
  height: number;
}

/**
 * Resizes so the longest edge is at most `maxEdge`, preserving aspect
 * ratio exactly (rounded to whole pixels). Never upscales — an image
 * already smaller than the target is left alone.
 */
export function computeResizedDimensions(source: ImageDimensions, maxEdge: number): ImageDimensions {
  const { width, height } = source;
  if (width <= 0 || height <= 0) {
    throw new RangeError(`computeResizedDimensions: invalid source dimensions ${width}x${height}`);
  }

  const longestEdge = Math.max(width, height);
  if (longestEdge <= maxEdge) {
    return { width, height };
  }

  const scale = maxEdge / longestEdge;
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export type OriginalFileValidation =
  | { valid: true }
  | { valid: false; reason: "empty" | "too_large" | "unsupported_format" };

/**
 * First gate before any compression work happens (§F hard limits) — an
 * absurdly large file is rejected outright, and only the three
 * client-side-encodable source formats are accepted. HEIC/HEIF is
 * deliberately NOT in the accepted list: decoding it client-side would
 * require a large dependency this stack doesn't have, so it's rejected
 * with a clear Thai message at the call site instead (§F).
 */
export function validateOriginalFile(sizeBytes: number, mimeType: string): OriginalFileValidation {
  if (sizeBytes <= 0) return { valid: false, reason: "empty" };
  if (sizeBytes > MAX_ORIGINAL_FILE_SIZE_BYTES) return { valid: false, reason: "too_large" };
  if (!ACCEPTED_SOURCE_MIME_TYPES.includes(mimeType as AcceptedSourceMimeType)) {
    return { valid: false, reason: "unsupported_format" };
  }
  return { valid: true };
}

/**
 * Progressive-quality stepping (§F step 6): starts at INITIAL_QUALITY: if
 * the encoded size is still over the soft target and quality can go
 * lower without dropping below MIN_QUALITY, try again one step down.
 * Returns null once there's nothing lower left to try — the caller then
 * accepts whatever the last attempt produced (as long as it's under the
 * hard cap) rather than destroying readability chasing an exact target.
 */
export function nextQuality(currentQuality: number): number | null {
  const next = Math.round((currentQuality - QUALITY_STEP) * 100) / 100;
  return next >= MIN_QUALITY ? next : null;
}

export interface CompressedProofMetadata {
  sizeBytes: number;
  mimeType: string;
  width: number;
  height: number;
}

export type CompressedFileValidation =
  | { valid: true }
  | { valid: false; reason: "too_large_after_compression" };

/** Final gate after compression (§F hard limits) — never upload an oversized output even if every quality step was exhausted. */
export function validateCompressedOutput(sizeBytes: number): CompressedFileValidation {
  if (sizeBytes > MAX_COMPRESSED_FILE_SIZE_BYTES) return { valid: false, reason: "too_large_after_compression" };
  return { valid: true };
}

export interface CanvasLike {
  width: number;
  height: number;
  getContext(kind: "2d"): { drawImage(image: unknown, dx: number, dy: number, dw: number, dh: number): void } | null;
  toBlob(callback: (blob: Blob | null) => void, type: string, quality: number): void;
}

export interface CompressImageDeps {
  /** Decodes the source file, respecting EXIF orientation (§F step 2). */
  loadBitmap: (file: File) => Promise<{ width: number; height: number; close?: () => void } & unknown>;
  createCanvas: (width: number, height: number) => CanvasLike;
}

function defaultDeps(): CompressImageDeps {
  return {
    loadBitmap: (file: File) =>
      // imageOrientation: "from-image" makes the decoded bitmap already
      // upright per the file's EXIF tag — no manual EXIF parsing needed.
      createImageBitmap(file, { imageOrientation: "from-image" }),
    createCanvas: (width: number, height: number) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      return canvas as unknown as CanvasLike;
    },
  };
}

export interface CompressedProofResult {
  blob: Blob;
  metadata: CompressedProofMetadata;
}

/**
 * Browser-only orchestrator (§F/§G): decode → resize longest edge to
 * ~1200px → encode as WebP starting at quality 0.65, stepping down while
 * still above the soft target, and falling back to JPEG if the browser's
 * canvas silently can't encode WebP (Safari < 14 etc. — canvas.toBlob
 * falls back to image/png for an unsupported requested type per spec,
 * which would defeat compression entirely, so that fallback is detected
 * and JPEG is used instead).
 */
export async function compressProofImage(file: File, deps: CompressImageDeps = defaultDeps()): Promise<CompressedProofResult> {
  const original = validateOriginalFile(file.size, file.type);
  if (!original.valid) {
    throw new ImageCompressionError(original.reason);
  }

  const bitmap = await deps.loadBitmap(file);
  const target = computeResizedDimensions({ width: bitmap.width, height: bitmap.height }, TARGET_LONGEST_EDGE_PX);

  const canvas = deps.createCanvas(target.width, target.height);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new ImageCompressionError("canvas_unavailable");
  ctx.drawImage(bitmap, 0, 0, target.width, target.height);
  (bitmap as { close?: () => void }).close?.();

  const encoded = await encodeWithFallback(canvas);

  const validation = validateCompressedOutput(encoded.size);
  if (!validation.valid) {
    throw new ImageCompressionError(validation.reason);
  }

  return {
    blob: encoded,
    metadata: {
      sizeBytes: encoded.size,
      mimeType: encoded.type,
      width: target.width,
      height: target.height,
    },
  };
}

async function encodeWithFallback(canvas: CanvasLike): Promise<Blob> {
  let quality: number | null = INITIAL_QUALITY;
  let best: Blob | null = null;
  let mimeType = "image/webp";

  while (quality !== null) {
    const blob = await toBlobAsync(canvas, mimeType, quality);
    if (blob && mimeType === "image/webp" && blob.type !== "image/webp") {
      // The browser silently fell back (e.g. to PNG) instead of
      // encoding WebP — switch the whole attempt to JPEG, which has
      // near-universal canvas encoder support with real quality control.
      mimeType = "image/jpeg";
      continue;
    }
    if (blob) {
      best = blob;
      if (blob.size <= TARGET_COMPRESSED_FILE_SIZE_BYTES) break;
    }
    quality = nextQuality(quality);
  }

  if (!best) throw new ImageCompressionError("encode_failed");
  return best;
}

function toBlobAsync(canvas: CanvasLike, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), type, quality));
}

export class ImageCompressionError extends Error {
  reason: string;
  constructor(reason: string) {
    super(`Image compression failed: ${reason}`);
    this.reason = reason;
    this.name = "ImageCompressionError";
  }
}
