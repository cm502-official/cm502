import { describe, expect, it } from "vitest";
import {
  calculateOverviewCards,
  calculateSalesOverTime,
  calculateSalesByColor,
  calculateSalesBySize,
  calculateColorSizeMatrix,
  calculateProductionSummary,
  filterOrdersByProductionStatus,
  buildCustomizationQaRows,
  findCustomizationWarnings,
  findMissingAddressOrders,
  findOrdersWithMissingCustomization,
  findNotSentToProductionOrders,
  buildAdminReport,
  type ReportOrderInput,
} from "./report-calculations";
import { resolveReportDateRange } from "./report-date-range";

const COLOR_ORDER = new Map([
  ["Black", 1],
  ["White", 2],
  ["Pink", 3],
  ["Brown", 4],
  ["Navy", 5],
]);
const SIZE_ORDER = new Map([
  ["S", 1],
  ["M", 2],
  ["L", 3],
  ["XL", 4],
  ["2XL", 5],
  ["8XL", 11],
  ["10XL", 13],
]);

const COMPLETE_ADDRESS = {
  addressLine: "1 Test Rd.",
  subdistrict: "สุเทพ",
  district: "เมืองเชียงใหม่",
  province: "เชียงใหม่",
  postalCode: "50200",
};

function order(overrides: Partial<ReportOrderInput> & { orderNumber: string }): ReportOrderInput {
  return {
    customerName: "Test Customer",
    verifiedAt: "2026-08-15T10:00:00.000Z",
    totalSatang: 0,
    productionExportedAt: null,
    address: COMPLETE_ADDRESS,
    items: [],
    ...overrides,
  };
}

describe("calculateOverviewCards", () => {
  it("counts shirts (line-item quantity sum), not order count — the §3 26-vs-3 example", () => {
    const orders: ReportOrderInput[] = [
      order({ orderNumber: "A", totalSatang: 41900, items: [{ colorName: "Black", sizeName: "M", quantity: 1, customizations: null }] }),
      order({ orderNumber: "B", totalSatang: 209500, items: [{ colorName: "Black", sizeName: "M", quantity: 5, customizations: null }] }),
      order({ orderNumber: "C", totalSatang: 838000, items: [{ colorName: "Black", sizeName: "M", quantity: 20, customizations: null }] }),
    ];
    const cards = calculateOverviewCards(orders);
    expect(cards.paidOrders).toBe(3);
    expect(cards.shirtsSold).toBe(26);
    expect(cards.totalRevenueSatang).toBe(41900 + 209500 + 838000);
  });

  it("computes average order value as revenue ÷ paid orders", () => {
    const orders: ReportOrderInput[] = [order({ orderNumber: "A", totalSatang: 40000 }), order({ orderNumber: "B", totalSatang: 60000 })];
    expect(calculateOverviewCards(orders).averageOrderValueSatang).toBe(50000);
  });

  it("returns all zeros (no NaN/Infinity) for an empty period — the §15 empty-state case", () => {
    const cards = calculateOverviewCards([]);
    expect(cards).toEqual({ totalRevenueSatang: 0, paidOrders: 0, shirtsSold: 0, averageOrderValueSatang: 0 });
  });
});

describe("calculateSalesOverTime", () => {
  it("buckets by day and sums revenue/orders/shirts per bucket", () => {
    const orders: ReportOrderInput[] = [
      order({ orderNumber: "A", verifiedAt: "2026-08-15T10:00:00.000Z", totalSatang: 10000, items: [{ colorName: "Black", sizeName: "M", quantity: 2, customizations: null }] }),
      order({ orderNumber: "B", verifiedAt: "2026-08-15T14:00:00.000Z", totalSatang: 20000, items: [{ colorName: "Black", sizeName: "M", quantity: 3, customizations: null }] }),
      order({ orderNumber: "C", verifiedAt: "2026-08-16T09:00:00.000Z", totalSatang: 5000, items: [{ colorName: "Black", sizeName: "M", quantity: 1, customizations: null }] }),
    ];
    const buckets = calculateSalesOverTime(orders, "day");
    expect(buckets).toEqual([
      { date: "2026-08-15", revenueSatang: 30000, orders: 2, shirts: 5 },
      { date: "2026-08-16", revenueSatang: 5000, orders: 1, shirts: 1 },
    ]);
  });
});

describe("calculateSalesByColor / calculateSalesBySize", () => {
  const orders: ReportOrderInput[] = [
    order({
      orderNumber: "A",
      items: [
        { colorName: "Black", sizeName: "M", quantity: 5, customizations: null },
        { colorName: "Navy", sizeName: "L", quantity: 3, customizations: null },
      ],
    }),
    order({ orderNumber: "B", items: [{ colorName: "Black", sizeName: "S", quantity: 2, customizations: null }] }),
  ];

  it("counts shirts per color, sorted by the live sort_order (not alphabetically), with percent of total", () => {
    const rows = calculateSalesByColor(orders, COLOR_ORDER);
    expect(rows).toEqual([
      { name: "Black", shirts: 7, percent: 70 },
      { name: "Navy", shirts: 3, percent: 30 },
    ]);
  });

  it("counts shirts per size, sorted by the live sort_order", () => {
    const rows = calculateSalesBySize(orders, SIZE_ORDER);
    expect(rows).toEqual([
      { name: "S", shirts: 2, percent: 20 },
      { name: "M", shirts: 5, percent: 50 },
      { name: "L", shirts: 3, percent: 30 },
    ]);
  });

  it("sorts an unknown color/size (not in the live table) to the end rather than throwing", () => {
    const withUnknown: ReportOrderInput[] = [
      order({ orderNumber: "A", items: [{ colorName: "Discontinued", sizeName: "M", quantity: 1, customizations: null }] }),
      order({ orderNumber: "B", items: [{ colorName: "Black", sizeName: "M", quantity: 1, customizations: null }] }),
    ];
    const rows = calculateSalesByColor(withUnknown, COLOR_ORDER);
    expect(rows.map((r) => r.name)).toEqual(["Black", "Discontinued"]);
  });
});

describe("calculateColorSizeMatrix", () => {
  it("cross-tabs shirt counts (not order counts) by color and size, with row/column/grand totals", () => {
    const orders: ReportOrderInput[] = [
      order({
        orderNumber: "A",
        items: [
          { colorName: "Black", sizeName: "M", quantity: 5, customizations: null },
          { colorName: "Black", sizeName: "L", quantity: 3, customizations: null },
        ],
      }),
      order({ orderNumber: "B", items: [{ colorName: "White", sizeName: "M", quantity: 2, customizations: null }] }),
    ];
    const matrix = calculateColorSizeMatrix(orders, COLOR_ORDER, SIZE_ORDER);
    expect(matrix.colors).toEqual(["Black", "White"]);
    expect(matrix.sizes).toEqual(["M", "L"]);
    expect(matrix.cells.Black.M).toBe(5);
    expect(matrix.cells.Black.L).toBe(3);
    expect(matrix.cells.White.M).toBe(2);
    expect(matrix.cells.White.L).toBeUndefined();
    expect(matrix.rowTotals).toEqual({ Black: 8, White: 2 });
    expect(matrix.colTotals).toEqual({ M: 7, L: 3 });
    expect(matrix.grandTotal).toBe(10);
  });

  it("returns an empty matrix (no crash) for zero orders", () => {
    const matrix = calculateColorSizeMatrix([], COLOR_ORDER, SIZE_ORDER);
    expect(matrix).toEqual({ colors: [], sizes: [], cells: {}, rowTotals: {}, colTotals: {}, grandTotal: 0 });
  });
});

describe("calculateProductionSummary / filterOrdersByProductionStatus", () => {
  const orders: ReportOrderInput[] = [
    order({ orderNumber: "A", productionExportedAt: "2026-08-16T00:00:00Z", items: [{ colorName: "Black", sizeName: "M", quantity: 3, customizations: null }] }),
    order({ orderNumber: "B", productionExportedAt: null, items: [{ colorName: "Black", sizeName: "M", quantity: 5, customizations: null }] }),
  ];

  it("splits paid shirts into sent vs. not-sent using orders.production_exported_at", () => {
    const summary = calculateProductionSummary(orders);
    expect(summary).toEqual({ paidShirts: 8, paidOrders: 2, sentShirts: 3, sentOrders: 1, notSentShirts: 5, notSentOrders: 1 });
  });

  it("filters orders by production status", () => {
    expect(filterOrdersByProductionStatus(orders, "sent").map((o) => o.orderNumber)).toEqual(["A"]);
    expect(filterOrdersByProductionStatus(orders, "not_sent").map((o) => o.orderNumber)).toEqual(["B"]);
    expect(filterOrdersByProductionStatus(orders, "all")).toEqual(orders);
  });
});

describe("buildCustomizationQaRows", () => {
  it("emits one row per physical shirt, matching the §10 example format", () => {
    const orders: ReportOrderInput[] = [
      order({
        orderNumber: "CM502-20260822-0012",
        customerName: "John",
        productionExportedAt: "2026-08-22T00:00:00Z",
        items: [{ colorName: "Black", sizeName: "XL", quantity: 1, customizations: [{ name: "JOHN", number: "11" }] }],
      }),
    ];
    const rows = buildCustomizationQaRows(orders);
    expect(rows).toEqual([
      {
        orderNumber: "CM502-20260822-0012",
        customerName: "John",
        colorName: "Black",
        sizeName: "XL",
        customName: "JOHN",
        customNumber: "11",
        productionStatus: "Sent",
      },
    ]);
  });

  it("expands a 10-shirt order into 10 rows", () => {
    const items = [
      {
        colorName: "Black",
        sizeName: "M",
        quantity: 10,
        customizations: Array.from({ length: 10 }, (_, i) => ({ name: `N${i}`, number: String(i) })),
      },
    ];
    const rows = buildCustomizationQaRows([order({ orderNumber: "A", items })]);
    expect(rows).toHaveLength(10);
  });

  it("falls back to null name/number for a legacy order with no customizations array at all", () => {
    const rows = buildCustomizationQaRows([order({ orderNumber: "A", items: [{ colorName: "Black", sizeName: "M", quantity: 2, customizations: null }] })]);
    expect(rows).toHaveLength(2);
    expect(rows[0].customName).toBeNull();
    expect(rows[0].customNumber).toBeNull();
  });
});

describe("findCustomizationWarnings", () => {
  it("flags a blank name and a blank number as separate warnings", () => {
    const orders: ReportOrderInput[] = [
      order({
        orderNumber: "A",
        items: [
          {
            colorName: "Black",
            sizeName: "M",
            quantity: 2,
            customizations: [
              { name: "", number: "10" },
              { name: "OK", number: null },
            ],
          },
        ],
      }),
    ];
    const warnings = findCustomizationWarnings(orders);
    expect(warnings).toEqual([
      { orderNumber: "A", customerName: "Test Customer", colorName: "Black", sizeName: "M", shirtIndex: 1, reason: "missing_name" },
      { orderNumber: "A", customerName: "Test Customer", colorName: "Black", sizeName: "M", shirtIndex: 2, reason: "missing_number" },
    ]);
  });

  it("flags a customization-count mismatch against quantity", () => {
    const orders: ReportOrderInput[] = [
      order({ orderNumber: "A", items: [{ colorName: "Black", sizeName: "M", quantity: 3, customizations: [{ name: "A", number: "1" }] }] }),
    ];
    expect(findCustomizationWarnings(orders)).toContainEqual(
      expect.objectContaining({ orderNumber: "A", reason: "count_mismatch" }),
    );
  });

  it("flags an entirely-missing customizations array", () => {
    const orders: ReportOrderInput[] = [order({ orderNumber: "A", items: [{ colorName: "Black", sizeName: "M", quantity: 2, customizations: null }] })];
    expect(findCustomizationWarnings(orders)).toEqual([
      { orderNumber: "A", customerName: "Test Customer", colorName: "Black", sizeName: "M", shirtIndex: 0, reason: "missing_customizations" },
    ]);
  });

  it("raises no warnings for a fully-specified order", () => {
    const orders: ReportOrderInput[] = [
      order({ orderNumber: "A", items: [{ colorName: "Black", sizeName: "M", quantity: 1, customizations: [{ name: "OK", number: "1" }] }] }),
    ];
    expect(findCustomizationWarnings(orders)).toEqual([]);
  });
});

describe("findMissingAddressOrders", () => {
  it("flags an order whose address is entirely null", () => {
    const orders: ReportOrderInput[] = [order({ orderNumber: "A", address: null })];
    expect(findMissingAddressOrders(orders)).toEqual([{ orderNumber: "A", customerName: "Test Customer" }]);
  });

  it("flags an order whose address has a blank required field", () => {
    const orders: ReportOrderInput[] = [order({ orderNumber: "A", address: { ...COMPLETE_ADDRESS, district: "" } })];
    expect(findMissingAddressOrders(orders)).toEqual([{ orderNumber: "A", customerName: "Test Customer" }]);
  });

  it("does not flag a complete address, and treats optional soi/delivery-note fields as irrelevant (not part of the required set)", () => {
    const orders: ReportOrderInput[] = [order({ orderNumber: "A", address: COMPLETE_ADDRESS })];
    expect(findMissingAddressOrders(orders)).toEqual([]);
  });
});

describe("findOrdersWithMissingCustomization", () => {
  it("returns one deduplicated row per flagged order, reusing findCustomizationWarnings", () => {
    const orders: ReportOrderInput[] = [
      order({
        orderNumber: "A",
        items: [
          { colorName: "Black", sizeName: "M", quantity: 1, customizations: [{ name: "", number: "1" }] },
          { colorName: "Navy", sizeName: "L", quantity: 1, customizations: [{ name: "", number: "1" }] },
        ],
      }),
      order({ orderNumber: "B", items: [{ colorName: "Black", sizeName: "M", quantity: 1, customizations: [{ name: "OK", number: "1" }] }] }),
    ];
    expect(findOrdersWithMissingCustomization(orders)).toEqual([{ orderNumber: "A", customerName: "Test Customer" }]);
  });
});

describe("findNotSentToProductionOrders", () => {
  it("reports both order count and shirt count", () => {
    const orders: ReportOrderInput[] = [
      order({ orderNumber: "A", productionExportedAt: null, items: [{ colorName: "Black", sizeName: "M", quantity: 4, customizations: null }] }),
      order({ orderNumber: "B", productionExportedAt: "2026-08-16T00:00:00Z", items: [{ colorName: "Black", sizeName: "M", quantity: 2, customizations: null }] }),
    ];
    const summary = findNotSentToProductionOrders(orders);
    expect(summary.totalOrders).toBe(1);
    expect(summary.totalShirts).toBe(4);
    expect(summary.orders).toEqual([{ orderNumber: "A", customerName: "Test Customer", shirts: 4 }]);
  });
});

describe("buildAdminReport", () => {
  it("assembles every section without crashing on an empty order set (§15/§16)", () => {
    const range = resolveReportDateRange({ preset: "this_month" });
    const report = buildAdminReport([], COLOR_ORDER, SIZE_ORDER, range);
    expect(report.overview.paidOrders).toBe(0);
    expect(report.salesByColor).toEqual([]);
    expect(report.colorSizeMatrix.grandTotal).toBe(0);
    expect(report.production.summary.paidShirts).toBe(0);
    expect(report.customizationQa).toEqual([]);
    expect(report.needsAttention.missingAddress).toEqual([]);
  });

  it("keeps the three production-filtered matrices consistent with the overall matrix", () => {
    const orders: ReportOrderInput[] = [
      order({ orderNumber: "A", productionExportedAt: "2026-08-16T00:00:00Z", items: [{ colorName: "Black", sizeName: "M", quantity: 3, customizations: null }] }),
      order({ orderNumber: "B", productionExportedAt: null, items: [{ colorName: "Navy", sizeName: "L", quantity: 2, customizations: null }] }),
    ];
    const range = resolveReportDateRange({ preset: "all_time" });
    const report = buildAdminReport(orders, COLOR_ORDER, SIZE_ORDER, range);
    expect(report.production.matrices.all.grandTotal).toBe(5);
    expect(report.production.matrices.sent.grandTotal).toBe(3);
    expect(report.production.matrices.not_sent.grandTotal).toBe(2);
  });
});
