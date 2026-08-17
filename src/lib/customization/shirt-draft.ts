/**
 * Pure, UI-agnostic logic for the per-shirt customization draft list — no
 * I/O, fully unit-testable. The product-page "ระบุรายละเอียดเสื้อ" modal
 * and the cart's "แก้ไขรายละเอียดเสื้อ" edit modal both build on this.
 */
import type { Color, Size, Variant } from "@/lib/catalog/types";
import { resolveVariant } from "@/lib/catalog/resolve-variant";
import type { ShirtCustomization } from "@/lib/cart/schema";

export interface ShirtDraft {
  /** Stable local id for React list identity — never array index (§4). */
  id: string;
  colorId: string | null;
  sizeId: string | null;
  name: string;
  number: string;
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `draft-${Date.now()}-${idCounter}`;
}

export function createBlankDraft(defaults?: { colorId?: string | null; sizeId?: string | null }): ShirtDraft {
  return {
    id: nextId(),
    colorId: defaults?.colorId ?? null,
    sizeId: defaults?.sizeId ?? null,
    name: "",
    number: "",
  };
}

/** A draft is "complete" once color + size are both chosen — name/number are optional (§5/§11). */
export function isDraftComplete(draft: ShirtDraft): boolean {
  return draft.colorId !== null && draft.sizeId !== null;
}

export function countComplete(drafts: ShirtDraft[]): number {
  return drafts.filter(isDraftComplete).length;
}

/** True when a draft has any user-entered data worth warning about before deletion. */
export function isDraftBlank(draft: ShirtDraft): boolean {
  return draft.colorId === null && draft.sizeId === null && draft.name.trim() === "" && draft.number.trim() === "";
}

/**
 * Resizes the draft list to `targetLength`, preserving existing entries
 * in place (§14). Growing appends blank drafts; shrinking drops from the
 * end. Returns both the new list and whether any dropped drafts carried
 * real data, so the caller can decide whether to confirm with the user
 * before committing a shrink.
 */
export function resizeDrafts(
  drafts: ShirtDraft[],
  targetLength: number,
): { drafts: ShirtDraft[]; droppedHadData: boolean } {
  if (targetLength >= drafts.length) {
    const additions = Array.from({ length: targetLength - drafts.length }, () => createBlankDraft());
    return { drafts: [...drafts, ...additions], droppedHadData: false };
  }
  const kept = drafts.slice(0, targetLength);
  const dropped = drafts.slice(targetLength);
  return { drafts: kept, droppedHadData: dropped.some((d) => !isDraftBlank(d)) };
}

export const NAME_MAX_LENGTH = 15;
export const JERSEY_NUMBER_REGEX = /^\d{1,2}$/;

export interface DraftFieldErrors {
  name?: string;
  number?: string;
}

/** Field-level validation for one draft's name/number — both optional, but must be well-formed if provided. */
export function validateDraftFields(draft: ShirtDraft): DraftFieldErrors {
  const errors: DraftFieldErrors = {};
  const trimmedName = draft.name.trim();
  if (trimmedName.length > NAME_MAX_LENGTH) {
    errors.name = `Name must be ${NAME_MAX_LENGTH} characters or fewer`;
  }
  const trimmedNumber = draft.number.trim();
  if (trimmedNumber !== "" && !JERSEY_NUMBER_REGEX.test(trimmedNumber)) {
    errors.number = "Number must be 0-99";
  }
  return errors;
}

export function isDraftValid(draft: ShirtDraft): boolean {
  if (!isDraftComplete(draft)) return false;
  const errors = validateDraftFields(draft);
  return !errors.name && !errors.number;
}

export function allDraftsValid(drafts: ShirtDraft[]): boolean {
  return drafts.length > 0 && drafts.every(isDraftValid);
}

/** Normalizes a draft's free-text fields into cart-storage shape: "" -> null, trimmed. Never uppercases (§6). */
export function draftToCustomization(draft: ShirtDraft): ShirtCustomization {
  const trimmedName = draft.name.trim();
  const trimmedNumber = draft.number.trim();
  return {
    name: trimmedName === "" ? null : trimmedName,
    number: trimmedNumber === "" ? null : trimmedNumber,
  };
}

export interface ResolvedShirtGroup {
  variant: Variant;
  color: Color;
  size: Size;
  customizations: ShirtCustomization[];
}

/**
 * Resolves a full list of valid drafts down to real catalog variants,
 * grouped by variant so shirts of the same color+size become one cart
 * line with multiple customizations (§16) rather than N separate lines.
 * Returns null if any draft doesn't resolve to a real, active variant —
 * callers must treat that as "cannot add to cart yet".
 */
export function resolveDraftsToGroups(
  drafts: ShirtDraft[],
  variants: Variant[],
  colors: Color[],
  sizes: Size[],
): ResolvedShirtGroup[] | null {
  const groups = new Map<string, ResolvedShirtGroup>();

  for (const draft of drafts) {
    if (!isDraftValid(draft)) return null;
    const variant = resolveVariant(variants, draft.colorId, draft.sizeId);
    if (!variant || !variant.isActive) return null;
    const color = colors.find((c) => c.id === draft.colorId);
    const size = sizes.find((s) => s.id === draft.sizeId);
    if (!color || !size) return null;

    const existing = groups.get(variant.id);
    const customization = draftToCustomization(draft);
    if (existing) {
      existing.customizations.push(customization);
    } else {
      groups.set(variant.id, { variant, color, size, customizations: [customization] });
    }
  }

  return Array.from(groups.values());
}
