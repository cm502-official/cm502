import { describe, expect, it } from "vitest";
import {
  allDraftsValid,
  countComplete,
  createBlankDraft,
  draftToCustomization,
  isDraftBlank,
  isDraftComplete,
  isDraftValid,
  resizeDrafts,
  resolveDraftsToGroups,
  validateDraftFields,
  type ShirtDraft,
} from "./shirt-draft";
import type { Color, Size, Variant } from "@/lib/catalog/types";

const BLACK: Color = { id: "color-black", name: "Black", hexCode: "#111", sortOrder: 1 };
const WHITE: Color = { id: "color-white", name: "White", hexCode: "#fff", sortOrder: 2 };
const SIZE_M: Size = { id: "size-m", name: "M", sortOrder: 1 };
const SIZE_L: Size = { id: "size-l", name: "L", sortOrder: 2 };

const VARIANTS: Variant[] = [
  { id: "v-black-m", colorId: BLACK.id, sizeId: SIZE_M.id, sku: "BLACK-M", priceSatangOverride: null, isActive: true, availableStock: null },
  { id: "v-black-l", colorId: BLACK.id, sizeId: SIZE_L.id, sku: "BLACK-L", priceSatangOverride: null, isActive: true, availableStock: null },
  { id: "v-white-m", colorId: WHITE.id, sizeId: SIZE_M.id, sku: "WHITE-M", priceSatangOverride: null, isActive: true, availableStock: null },
  { id: "v-white-l", colorId: WHITE.id, sizeId: SIZE_L.id, sku: "WHITE-L", priceSatangOverride: null, isActive: false, availableStock: null },
];

function draft(overrides: Partial<ShirtDraft> = {}): ShirtDraft {
  return { id: "d1", colorId: null, sizeId: null, name: "", number: "", ...overrides };
}

describe("createBlankDraft", () => {
  it("creates a blank, incomplete draft", () => {
    const d = createBlankDraft();
    expect(d.colorId).toBeNull();
    expect(d.sizeId).toBeNull();
    expect(d.name).toBe("");
    expect(d.number).toBe("");
  });

  it("gives every draft a unique stable id", () => {
    const ids = new Set(Array.from({ length: 50 }, () => createBlankDraft().id));
    expect(ids.size).toBe(50);
  });
});

describe("isDraftComplete / countComplete — color+size only, name/number optional (§5/§11)", () => {
  it("is complete once color and size are chosen, regardless of name/number", () => {
    expect(isDraftComplete(draft({ colorId: BLACK.id, sizeId: SIZE_M.id }))).toBe(true);
    expect(isDraftComplete(draft({ colorId: BLACK.id, sizeId: SIZE_M.id, name: "", number: "" }))).toBe(true);
  });

  it("is incomplete if either color or size is missing", () => {
    expect(isDraftComplete(draft({ colorId: BLACK.id, sizeId: null }))).toBe(false);
    expect(isDraftComplete(draft({ colorId: null, sizeId: SIZE_M.id }))).toBe(false);
    expect(isDraftComplete(draft())).toBe(false);
  });

  it("counts only complete drafts, e.g. 18/30", () => {
    const drafts = [
      ...Array.from({ length: 18 }, () => draft({ colorId: BLACK.id, sizeId: SIZE_M.id })),
      ...Array.from({ length: 12 }, () => draft()),
    ];
    expect(countComplete(drafts)).toBe(18);
  });
});

describe("resizeDrafts (§14)", () => {
  it("appends blank drafts when growing, preserving existing entries", () => {
    const existing = [draft({ id: "a", colorId: BLACK.id, sizeId: SIZE_M.id })];
    const { drafts, droppedHadData } = resizeDrafts(existing, 3);
    expect(drafts).toHaveLength(3);
    expect(drafts[0].id).toBe("a");
    expect(droppedHadData).toBe(false);
  });

  it("drops from the end when shrinking, reporting whether dropped drafts had data", () => {
    const existing = [
      draft({ id: "a", colorId: BLACK.id, sizeId: SIZE_M.id, name: "LUCIFER" }),
      draft({ id: "b" }),
      draft({ id: "c" }),
    ];
    const { drafts, droppedHadData } = resizeDrafts(existing, 1);
    expect(drafts).toHaveLength(1);
    expect(drafts[0].id).toBe("a");
    expect(droppedHadData).toBe(false); // b and c were both blank
  });

  it("reports droppedHadData=true when a removed draft carried real data", () => {
    const existing = [
      draft({ id: "a" }),
      draft({ id: "b", colorId: BLACK.id, sizeId: SIZE_M.id, name: "POND" }),
    ];
    const { droppedHadData } = resizeDrafts(existing, 1);
    expect(droppedHadData).toBe(true);
  });

  it("§ cart quantity editing: 3 → 5 preserves all 3 customized shirts and appends exactly 2 blank ones", () => {
    const three = [
      draft({ id: "1", colorId: BLACK.id, sizeId: SIZE_M.id, name: "LUCIFER", number: "88" }),
      draft({ id: "2", colorId: WHITE.id, sizeId: SIZE_L.id, name: "MARK", number: "07" }),
      draft({ id: "3", colorId: BLACK.id, sizeId: SIZE_L.id, name: "", number: "" }),
    ];
    const { drafts: five, droppedHadData } = resizeDrafts(three, 5);
    expect(five).toHaveLength(5);
    expect(five.slice(0, 3)).toEqual(three);
    expect(five[3].colorId).toBeNull();
    expect(five[4].colorId).toBeNull();
    expect(droppedHadData).toBe(false);
    // Leading-zero preserved through the resize.
    expect(five[1].number).toBe("07");
  });

  it("§ cart quantity editing: 5 → 3 after appending 2 blanks removes only the trailing 2, first 3 untouched", () => {
    const three = [
      draft({ id: "1", colorId: BLACK.id, sizeId: SIZE_M.id, name: "LUCIFER", number: "88" }),
      draft({ id: "2", colorId: WHITE.id, sizeId: SIZE_L.id, name: "MARK", number: "07" }),
      draft({ id: "3", colorId: BLACK.id, sizeId: SIZE_L.id, name: "", number: "" }),
    ];
    const { drafts: five } = resizeDrafts(three, 5); // two trailing blanks appended
    const { drafts: backToThree, droppedHadData } = resizeDrafts(five, 3);
    expect(backToThree).toEqual(three);
    expect(droppedHadData).toBe(false); // the two dropped shirts were still blank
  });
});

describe("isDraftBlank", () => {
  it("is true only when color, size, name, and number are all empty", () => {
    expect(isDraftBlank(draft())).toBe(true);
    expect(isDraftBlank(draft({ name: "X" }))).toBe(false);
    expect(isDraftBlank(draft({ colorId: BLACK.id }))).toBe(false);
  });
});

describe("validateDraftFields / isDraftValid — name/number optional but well-formed if present", () => {
  it("empty name/number is valid when color+size are set (§5)", () => {
    const d = draft({ colorId: BLACK.id, sizeId: SIZE_M.id, name: "", number: "" });
    expect(validateDraftFields(d)).toEqual({});
    expect(isDraftValid(d)).toBe(true);
  });

  it("accepts valid jersey numbers, including leading zero", () => {
    for (const n of ["0", "7", "07", "09", "10", "88", "99"]) {
      const d = draft({ colorId: BLACK.id, sizeId: SIZE_M.id, number: n });
      expect(validateDraftFields(d).number).toBeUndefined();
    }
  });

  it("rejects invalid jersey numbers", () => {
    for (const n of ["100", "-5", "7.5", "ABC"]) {
      const d = draft({ colorId: BLACK.id, sizeId: SIZE_M.id, number: n });
      expect(validateDraftFields(d).number).toBeDefined();
      expect(isDraftValid(d)).toBe(false);
    }
  });

  it("accepts a name up to 15 characters", () => {
    const d = draft({ colorId: BLACK.id, sizeId: SIZE_M.id, name: "A".repeat(15) });
    expect(validateDraftFields(d).name).toBeUndefined();
  });

  it("rejects a name longer than 15 characters", () => {
    const d = draft({ colorId: BLACK.id, sizeId: SIZE_M.id, name: "A".repeat(16) });
    expect(validateDraftFields(d).name).toBeDefined();
    expect(isDraftValid(d)).toBe(false);
  });

  it("is invalid without color+size even if name/number are fine", () => {
    const d = draft({ name: "OK", number: "7" });
    expect(isDraftValid(d)).toBe(false);
  });
});

describe("allDraftsValid", () => {
  it("is false for an empty list", () => {
    expect(allDraftsValid([])).toBe(false);
  });

  it("is true only when every draft is valid", () => {
    const good = draft({ colorId: BLACK.id, sizeId: SIZE_M.id });
    const bad = draft();
    expect(allDraftsValid([good, good])).toBe(true);
    expect(allDraftsValid([good, bad])).toBe(false);
  });

  it("holds for a 30-shirt fully-completed batch", () => {
    const drafts = Array.from({ length: 30 }, (_, i) =>
      draft({ id: `d${i}`, colorId: BLACK.id, sizeId: SIZE_M.id, number: String(i % 100) }),
    );
    expect(allDraftsValid(drafts)).toBe(true);
    expect(drafts).toHaveLength(30);
  });
});

describe("draftToCustomization — normalizes to cart storage shape (§6)", () => {
  it('converts "" to null for both fields', () => {
    expect(draftToCustomization(draft({ name: "", number: "" }))).toEqual({ name: null, number: null });
  });

  it("trims whitespace but never uppercases", () => {
    expect(draftToCustomization(draft({ name: "  lucifer  ", number: "7" }))).toEqual({
      name: "lucifer",
      number: "7",
    });
  });

  it("preserves a leading-zero number exactly", () => {
    expect(draftToCustomization(draft({ number: "07" })).number).toBe("07");
  });
});

describe("resolveDraftsToGroups — variant resolution + grouping (§9/§16)", () => {
  it("returns null if any draft is invalid/incomplete", () => {
    const drafts = [draft({ colorId: BLACK.id, sizeId: null })];
    expect(resolveDraftsToGroups(drafts, VARIANTS, [BLACK, WHITE], [SIZE_M, SIZE_L])).toBeNull();
  });

  it("returns null if the resolved variant is inactive", () => {
    const drafts = [draft({ colorId: WHITE.id, sizeId: SIZE_L.id })];
    expect(resolveDraftsToGroups(drafts, VARIANTS, [BLACK, WHITE], [SIZE_M, SIZE_L])).toBeNull();
  });

  it("resolves one shirt to one group", () => {
    const drafts = [draft({ colorId: BLACK.id, sizeId: SIZE_M.id, name: "LUCIFER", number: "88" })];
    const groups = resolveDraftsToGroups(drafts, VARIANTS, [BLACK, WHITE], [SIZE_M, SIZE_L]);
    expect(groups).toHaveLength(1);
    expect(groups?.[0].variant.id).toBe("v-black-m");
    expect(groups?.[0].customizations).toEqual([{ name: "LUCIFER", number: "88" }]);
  });

  it("groups two shirts of the SAME variant into one group without losing either customization", () => {
    const drafts = [
      draft({ id: "1", colorId: BLACK.id, sizeId: SIZE_M.id, name: "LUCIFER", number: "88" }),
      draft({ id: "2", colorId: BLACK.id, sizeId: SIZE_M.id, name: "POND", number: "10" }),
    ];
    const groups = resolveDraftsToGroups(drafts, VARIANTS, [BLACK, WHITE], [SIZE_M, SIZE_L]);
    expect(groups).toHaveLength(1);
    expect(groups?.[0].customizations).toEqual([
      { name: "LUCIFER", number: "88" },
      { name: "POND", number: "10" },
    ]);
  });

  it("splits shirts of different variants into separate groups (3-shirt mixed example)", () => {
    const drafts = [
      draft({ id: "1", colorId: BLACK.id, sizeId: SIZE_M.id, name: "JOHN", number: "10" }),
      draft({ id: "2", colorId: WHITE.id, sizeId: SIZE_M.id, name: "MARK", number: "7" }),
      draft({ id: "3", colorId: BLACK.id, sizeId: SIZE_L.id, name: "", number: "7" }),
    ];
    const groups = resolveDraftsToGroups(drafts, VARIANTS, [BLACK, WHITE], [SIZE_M, SIZE_L]);
    expect(groups).toHaveLength(3);
    const total = groups!.reduce((sum, g) => sum + g.customizations.length, 0);
    expect(total).toBe(3);
  });

  it("handles a 30-shirt payload, correctly grouping and preserving quantity", () => {
    const drafts = Array.from({ length: 30 }, (_, i) =>
      draft({
        id: `d${i}`,
        colorId: i % 2 === 0 ? BLACK.id : WHITE.id,
        sizeId: SIZE_M.id,
        name: `PLAYER${i}`,
        number: String(i % 100),
      }),
    );
    const groups = resolveDraftsToGroups(drafts, VARIANTS, [BLACK, WHITE], [SIZE_M, SIZE_L]);
    expect(groups).not.toBeNull();
    const total = groups!.reduce((sum, g) => sum + g.customizations.length, 0);
    expect(total).toBe(30);
  });
});
