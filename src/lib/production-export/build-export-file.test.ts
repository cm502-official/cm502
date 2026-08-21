import { describe, expect, it } from "vitest";
import {
  buildBulkProductionExportRows,
  collectBulkExportErrors,
  formatBulkProductionExportGrouped,
  formatBulkProductionExportRaw,
  type ProductionExportOrderInput,
} from "./build-export-file";

const ORDER_1: ProductionExportOrderInput = {
  orderNumber: "CM502-20260821-0001",
  items: [
    { colorNameSnapshot: "Black", sizeNameSnapshot: "8XL", quantity: 1, customizations: [{ name: "Nachanok", number: "22" }] },
    { colorNameSnapshot: "Black", sizeNameSnapshot: "2XL", quantity: 1, customizations: [{ name: "KORKOR", number: "10" }] },
  ],
};

const ORDER_2: ProductionExportOrderInput = {
  orderNumber: "CM502-20260821-0002",
  items: [
    { colorNameSnapshot: "Navy", sizeNameSnapshot: "L", quantity: 1, customizations: [{ name: "NAME", number: "88" }] },
    { colorNameSnapshot: "White", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "TEST", number: "07" }] },
  ],
};

describe("bulk export — grouped/header mode (§12 preferred format)", () => {
  it("matches the task-brief example exactly", () => {
    const rows = buildBulkProductionExportRows([ORDER_1, ORDER_2]);
    const output = formatBulkProductionExportGrouped(rows);
    expect(output).toBe(
      [
        "# CM502-20260821-0001",
        "1/black/8XL/Nachanok/22",
        "2/black/2XL/KORKOR/10",
        "# CM502-20260821-0002",
        "1/navy/L/NAME/88",
        "2/white/M/TEST/07",
      ].join("\n"),
    );
  });

  it("restarts sequence at 1 for every order", () => {
    const rows = buildBulkProductionExportRows([ORDER_1, ORDER_2]);
    expect(rows[0].rows.map((r) => r.sequence)).toEqual([1, 2]);
    expect(rows[1].rows.map((r) => r.sequence)).toEqual([1, 2]);
  });
});

describe("bulk export — raw/headerless mode (ไม่มีหัวข้อ)", () => {
  it("contains only slash-separated lines, no '#' headers", () => {
    const output = formatBulkProductionExportRaw([ORDER_1, ORDER_2]);
    expect(output).not.toContain("#");
  });

  it("renumbers continuously across the whole batch", () => {
    const output = formatBulkProductionExportRaw([ORDER_1, ORDER_2]);
    expect(output).toBe(
      ["1/black/8XL/Nachanok/22", "2/black/2XL/KORKOR/10", "3/navy/L/NAME/88", "4/white/M/TEST/07"].join("\n"),
    );
  });
});

describe("collectBulkExportErrors", () => {
  it("returns nothing when every order is clean", () => {
    const rows = buildBulkProductionExportRows([ORDER_1, ORDER_2]);
    expect(collectBulkExportErrors(rows)).toEqual([]);
  });

  it("surfaces which order + shirt has a corrupt customization", () => {
    const bad: ProductionExportOrderInput = {
      orderNumber: "CM502-BAD-0001",
      items: [{ colorNameSnapshot: "Black", sizeNameSnapshot: "M", quantity: 1, customizations: [{ name: "Bad/Name", number: "1" }] }],
    };
    const rows = buildBulkProductionExportRows([ORDER_1, bad]);
    const errors = collectBulkExportErrors(rows);
    expect(errors).toHaveLength(1);
    expect(errors[0].orderNumber).toBe("CM502-BAD-0001");
  });
});

describe("multi-order export — single order unaffected by others", () => {
  it("an order's own rows are identical whether exported alone or in a batch", () => {
    const alone = buildBulkProductionExportRows([ORDER_1])[0];
    const inBatch = buildBulkProductionExportRows([ORDER_2, ORDER_1])[1];
    expect(inBatch.rows).toEqual(alone.rows);
  });
});
