import { describe, expect, it } from "vitest";
import {
  buildProductionExportRows,
  formatProductionRowsAsCsv,
  formatProductionRowsAsTxt,
  type ProductionExportItemInput,
} from "./build-export-rows";

describe("buildProductionExportRows — exact task-brief example", () => {
  const items: ProductionExportItemInput[] = [
    {
      colorNameSnapshot: "Black",
      sizeNameSnapshot: "8XL",
      quantity: 1,
      customizations: [{ name: "Nachanok", number: "22" }],
    },
    {
      colorNameSnapshot: "Black",
      sizeNameSnapshot: "2XL",
      quantity: 1,
      customizations: [{ name: "KORKOR", number: "10" }],
    },
  ];

  it("produces exactly the required TXT output", () => {
    const { rows, errors } = buildProductionExportRows(items);
    expect(errors).toEqual([]);
    const txt = formatProductionRowsAsTxt(rows);
    expect(txt).toBe("1/black/8XL/Nachanok/22\n2/black/2XL/KORKOR/10");
  });

  it("sequences starting at 1", () => {
    const { rows } = buildProductionExportRows(items);
    expect(rows.map((r) => r.sequence)).toEqual([1, 2]);
  });
});

describe("buildProductionExportRows — color normalization", () => {
  it.each([
    ["Black", "black"],
    ["White", "white"],
    ["Pink", "pink"],
    ["Brown", "brown"],
    ["Navy", "navy"],
  ])("normalizes %s -> %s (lowercase English, never Thai)", (input, expected) => {
    const { rows } = buildProductionExportRows([
      { colorNameSnapshot: input, sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: null, number: null }] },
    ]);
    expect(rows[0].color).toBe(expected);
  });
});

describe("buildProductionExportRows — size handling", () => {
  it.each(["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL", "6XL", "7XL", "8XL", "9XL", "10XL"])(
    "keeps canonical uppercase size %s",
    (size) => {
      const { rows } = buildProductionExportRows([
        { colorNameSnapshot: "Black", sizeNameSnapshot: size, quantity: 1, customizations: [{ name: null, number: null }] },
      ]);
      expect(rows[0].size).toBe(size);
    },
  );

  it("uppercases a lowercase size defensively", () => {
    const { rows } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "xl", quantity: 1, customizations: [{ name: null, number: null }] },
    ]);
    expect(rows[0].size).toBe("XL");
  });
});

describe("buildProductionExportRows — customization handling", () => {
  it("preserves a leading-zero number as a string", () => {
    const { rows } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "Somchai", number: "07" }] },
    ]);
    expect(rows[0].number).toBe("07");
  });

  it("trims leading/trailing whitespace from name and number", () => {
    const { rows } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "  Somchai  ", number: " 7 " }] },
    ]);
    expect(rows[0].name).toBe("Somchai");
    expect(rows[0].number).toBe("7");
  });

  it("does not change capitalization of the name", () => {
    const { rows } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "kOrKoR", number: "10" }] },
    ]);
    expect(rows[0].name).toBe("kOrKoR");
  });

  it("uses a '-' placeholder for missing/null customization (optional, §9)", () => {
    const { rows } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: null, number: null }] },
    ]);
    expect(rows[0].name).toBe("-");
    expect(rows[0].number).toBe("-");
  });

  it("uses '-' for a historical order predating personalization (customizations: null)", () => {
    const { rows } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 2, customizations: null },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.name === "-" && r.number === "-")).toBe(true);
  });
});

describe("buildProductionExportRows — quantity expansion, never collapsing distinct shirts", () => {
  it("expands one order_items line of quantity 3 into 3 physical-shirt rows", () => {
    const { rows } = buildProductionExportRows([
      {
        colorNameSnapshot: "Navy",
        sizeNameSnapshot: "L",
        quantity: 3,
        customizations: [
          { name: "A", number: "1" },
          { name: "B", number: "2" },
          { name: "C", number: "3" },
        ],
      },
    ]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toEqual(["A", "B", "C"]);
  });

  it("never collapses two shirts with different customizations even if same color/size", () => {
    const { rows } = buildProductionExportRows([
      {
        colorNameSnapshot: "White",
        sizeNameSnapshot: "M",
        quantity: 2,
        customizations: [
          { name: "Same", number: "1" },
          { name: "Same", number: "2" },
        ],
      },
    ]);
    expect(rows).toHaveLength(2);
    expect(rows[0].number).toBe("1");
    expect(rows[1].number).toBe("2");
  });

  it("continues sequence across multiple order_items lines", () => {
    const { rows } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "8XL", quantity: 1, customizations: [{ name: "Nachanok", number: "22" }] },
      { colorNameSnapshot: "Black", sizeNameSnapshot: "2XL", quantity: 1, customizations: [{ name: "KORKOR", number: "10" }] },
      { colorNameSnapshot: "Navy", sizeNameSnapshot: "L", quantity: 1, customizations: [{ name: "Third", number: "3" }] },
    ]);
    expect(rows.map((r) => r.sequence)).toEqual([1, 2, 3]);
  });
});

describe("buildProductionExportRows — corruption guards (§17)", () => {
  it("flags a name containing '/' as an error and does not silently accept it", () => {
    const { errors } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "Bad/Name", number: "1" }] },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].message).toContain("เสื้อตัวที่ 1");
  });

  it("flags a name containing a newline as an error", () => {
    const { errors } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "Bad\nName", number: "1" }] },
    ]);
    expect(errors).toHaveLength(1);
  });

  it("reports the correct shirt sequence number for an error deep in a multi-shirt order", () => {
    const { errors } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "Fine", number: "1" }] },
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "Fine2", number: "2" }] },
      { colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "Bad/One", number: "3" }] },
    ]);
    expect(errors).toHaveLength(1);
    expect(errors[0].sequence).toBe(3);
  });
});

describe("formatProductionRowsAsCsv", () => {
  it("produces a header + comma rows from the same normalized data", () => {
    const { rows } = buildProductionExportRows([
      { colorNameSnapshot: "Black", sizeNameSnapshot: "8XL", quantity: 1, customizations: [{ name: "Nachanok", number: "22" }] },
    ]);
    const csv = formatProductionRowsAsCsv(rows);
    expect(csv).toBe("sequence,color,size,name,number\n1,black,8XL,Nachanok,22");
  });
});
