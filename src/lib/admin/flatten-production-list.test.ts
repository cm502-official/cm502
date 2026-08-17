import { describe, expect, it } from "vitest";
import { flattenOrderItemsToProductionRows } from "./flatten-production-list";

describe("flattenOrderItemsToProductionRows", () => {
  it("flattens Black/M/LUCIFER/88, Black/M/POND/07, White/L/null/null into 3 ordered rows", () => {
    const rows = flattenOrderItemsToProductionRows([
      {
        colorNameSnapshot: "Black",
        sizeNameSnapshot: "M",
        customizations: [
          { name: "LUCIFER", number: "88" },
          { name: "POND", number: "07" },
        ],
      },
      {
        colorNameSnapshot: "White",
        sizeNameSnapshot: "L",
        customizations: [{ name: null, number: null }],
      },
    ]);

    expect(rows).toEqual([
      { index: 1, colorName: "Black", sizeName: "M", name: "LUCIFER", number: "88" },
      { index: 2, colorName: "Black", sizeName: "M", name: "POND", number: "07" },
      { index: 3, colorName: "White", sizeName: "L", name: null, number: null },
    ]);
  });

  it("preserves a leading-zero number exactly — never coerces '07' to 7", () => {
    const rows = flattenOrderItemsToProductionRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", customizations: [{ name: null, number: "07" }] },
    ]);
    expect(rows[0].number).toBe("07");
  });

  it("numbers rows continuously across multiple line items, not restarting per item", () => {
    const rows = flattenOrderItemsToProductionRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", customizations: [{ name: "A", number: "1" }] },
      { colorNameSnapshot: "White", sizeNameSnapshot: "L", customizations: [{ name: "B", number: "2" }] },
      { colorNameSnapshot: "Navy", sizeNameSnapshot: "S", customizations: [{ name: "C", number: "3" }] },
    ]);
    expect(rows.map((r) => r.index)).toEqual([1, 2, 3]);
  });

  it("returns an empty list for a pre-personalization order (customizations null)", () => {
    const rows = flattenOrderItemsToProductionRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", customizations: null },
    ]);
    expect(rows).toEqual([]);
  });

  it("flattens a 30-shirt order correctly", () => {
    const items = [
      {
        colorNameSnapshot: "Black",
        sizeNameSnapshot: "M",
        customizations: Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, number: String(i % 100) })),
      },
    ];
    const rows = flattenOrderItemsToProductionRows(items);
    expect(rows).toHaveLength(30);
    expect(rows[0].index).toBe(1);
    expect(rows[29].index).toBe(30);
  });
});
