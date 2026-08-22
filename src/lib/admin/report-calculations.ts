/**
 * Pure aggregation logic for /admin/report. Every function here takes
 * plain, already-paid-filtered data (see get-admin-report-data.ts for
 * the Supabase fetch + paid-only filter) and plain lookup maps — no
 * Supabase, no Next.js APIs — so the numbers that appear on the page are
 * unit-testable without mocking a database (§23).
 *
 * "Paid" is enforced entirely upstream (the fetch layer only ever
 * queries orders.payment_status = 'verified', the single source of
 * truth per src/lib/orders/lifecycle.ts). Nothing in this file re-checks
 * payment status — every `ReportOrderInput` passed in is assumed
 * already-paid, and every calculation here counts 100% of what it's
 * given (§19: revenue uses the order's own stored total_satang, never a
 * frontend-recomputed price).
 */

import {
  bucketKeyForTimestamp,
  pickBucketGranularity,
  type ReportBucketGranularity,
  type ResolvedReportRange,
} from "./report-date-range";

export interface ReportCustomizationUnit {
  name: string | null;
  number: string | null;
}

export interface ReportOrderItemInput {
  colorName: string;
  sizeName: string;
  quantity: number;
  /** One entry per physical shirt — null only for orders placed before per-shirt customization existed. */
  customizations: ReportCustomizationUnit[] | null;
}

export interface ReportOrderAddressInput {
  addressLine: string | null;
  subdistrict: string | null;
  district: string | null;
  province: string | null;
  postalCode: string | null;
}

export interface ReportOrderInput {
  orderNumber: string;
  customerName: string | null;
  /** When payment was verified — the timestamp date filtering/bucketing is based on (see report-date-range.ts). */
  verifiedAt: string;
  totalSatang: number;
  /** null = not yet marked "ส่งเข้าผลิตแล้ว" — reuses orders.production_exported_at, no duplicate status field. */
  productionExportedAt: string | null;
  /** null only if the address row itself is somehow missing (shipping_address_id is NOT NULL, so this is defensive, not expected). */
  address: ReportOrderAddressInput | null;
  items: ReportOrderItemInput[];
}

function shirtCount(order: ReportOrderInput): number {
  return order.items.reduce((sum, item) => sum + item.quantity, 0);
}

function sortByOrderMap(names: string[], orderMap: Map<string, number>): string[] {
  return [...names].sort((a, b) => {
    const diff = (orderMap.get(a) ?? Number.MAX_SAFE_INTEGER) - (orderMap.get(b) ?? Number.MAX_SAFE_INTEGER);
    return diff !== 0 ? diff : a.localeCompare(b);
  });
}

// ── §3 Overview cards ───────────────────────────────────────────────────

export interface ReportOverviewCards {
  totalRevenueSatang: number;
  paidOrders: number;
  /** Total physical shirts across all paid orders' line items — NOT the order count (§3 "26 Shirts, ไม่ใช่ 3"). */
  shirtsSold: number;
  averageOrderValueSatang: number;
}

export function calculateOverviewCards(orders: ReportOrderInput[]): ReportOverviewCards {
  const totalRevenueSatang = orders.reduce((sum, o) => sum + o.totalSatang, 0);
  const paidOrders = orders.length;
  const shirtsSold = orders.reduce((sum, o) => sum + shirtCount(o), 0);
  const averageOrderValueSatang = paidOrders > 0 ? Math.round(totalRevenueSatang / paidOrders) : 0;
  return { totalRevenueSatang, paidOrders, shirtsSold, averageOrderValueSatang };
}

// ── §4 Sales over time ──────────────────────────────────────────────────

export interface SalesOverTimeBucket {
  /** Bucket key — a Bangkok-local yyyy-mm-dd (day bucket) or the Bangkok-local Monday of that week (week bucket). */
  date: string;
  revenueSatang: number;
  orders: number;
  shirts: number;
}

export function calculateSalesOverTime(
  orders: ReportOrderInput[],
  granularity: ReportBucketGranularity,
): SalesOverTimeBucket[] {
  const map = new Map<string, SalesOverTimeBucket>();
  for (const order of orders) {
    const key = bucketKeyForTimestamp(order.verifiedAt, granularity);
    const bucket = map.get(key) ?? { date: key, revenueSatang: 0, orders: 0, shirts: 0 };
    bucket.revenueSatang += order.totalSatang;
    bucket.orders += 1;
    bucket.shirts += shirtCount(order);
    map.set(key, bucket);
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/** Picks day vs. week granularity for a resolved range; falls back to the actual span of the order data when the range itself is unbounded (All Time). */
export function resolveSalesOverTimeGranularity(
  orders: ReportOrderInput[],
  range: Pick<ResolvedReportRange, "startIso" | "endIso">,
): ReportBucketGranularity {
  if (range.startIso && range.endIso) return pickBucketGranularity(range.startIso, range.endIso);
  if (orders.length === 0) return "day";
  const timestamps = orders.map((o) => new Date(o.verifiedAt).getTime());
  const spanDays = (Math.max(...timestamps) - Math.min(...timestamps)) / (24 * 60 * 60 * 1000);
  return spanDays > 60 ? "week" : "day";
}

// ── §5/§6 Sales by color / size ─────────────────────────────────────────

export interface SalesByDimensionRow {
  name: string;
  shirts: number;
  /** Rounded to 1 decimal place; 0 (not NaN) when there are no shirts at all. */
  percent: number;
}

function calculateSalesByDimension(
  orders: ReportOrderInput[],
  pick: (item: ReportOrderItemInput) => string,
  orderMap: Map<string, number>,
): SalesByDimensionRow[] {
  const counts = new Map<string, number>();
  let total = 0;
  for (const order of orders) {
    for (const item of order.items) {
      const key = pick(item);
      counts.set(key, (counts.get(key) ?? 0) + item.quantity);
      total += item.quantity;
    }
  }
  const names = sortByOrderMap([...counts.keys()], orderMap);
  return names.map((name) => {
    const shirts = counts.get(name) ?? 0;
    return { name, shirts, percent: total > 0 ? Math.round((shirts / total) * 1000) / 10 : 0 };
  });
}

/** §5 — sorted by the live `colors.sort_order` (the same order the storefront swatches use), not alphabetically. */
export function calculateSalesByColor(orders: ReportOrderInput[], colorOrder: Map<string, number>): SalesByDimensionRow[] {
  return calculateSalesByDimension(orders, (item) => item.colorName, colorOrder);
}

/** §6 — sorted by the live `sizes.sort_order` (S/M/L/XL/2XL/.../10XL in that human order), never hardcoded or alphabetical. */
export function calculateSalesBySize(orders: ReportOrderInput[], sizeOrder: Map<string, number>): SalesByDimensionRow[] {
  return calculateSalesByDimension(orders, (item) => item.sizeName, sizeOrder);
}

// ── §7 Color × Size summary ─────────────────────────────────────────────

export interface ColorSizeMatrix {
  colors: string[];
  sizes: string[];
  cells: Record<string, Record<string, number>>;
  rowTotals: Record<string, number>;
  colTotals: Record<string, number>;
  grandTotal: number;
}

export function calculateColorSizeMatrix(
  orders: ReportOrderInput[],
  colorOrder: Map<string, number>,
  sizeOrder: Map<string, number>,
): ColorSizeMatrix {
  const cells: Record<string, Record<string, number>> = {};
  const colorsSeen = new Set<string>();
  const sizesSeen = new Set<string>();
  let grandTotal = 0;

  for (const order of orders) {
    for (const item of order.items) {
      colorsSeen.add(item.colorName);
      sizesSeen.add(item.sizeName);
      cells[item.colorName] ??= {};
      cells[item.colorName][item.sizeName] = (cells[item.colorName][item.sizeName] ?? 0) + item.quantity;
      grandTotal += item.quantity;
    }
  }

  const colors = sortByOrderMap([...colorsSeen], colorOrder);
  const sizes = sortByOrderMap([...sizesSeen], sizeOrder);

  const rowTotals: Record<string, number> = {};
  for (const color of colors) {
    rowTotals[color] = sizes.reduce((sum, size) => sum + (cells[color]?.[size] ?? 0), 0);
  }
  const colTotals: Record<string, number> = {};
  for (const size of sizes) {
    colTotals[size] = colors.reduce((sum, color) => sum + (cells[color]?.[size] ?? 0), 0);
  }

  return { colors, sizes, cells, rowTotals, colTotals, grandTotal };
}

// ── §8/§9 Production summary ────────────────────────────────────────────

export interface ProductionSummary {
  paidShirts: number;
  paidOrders: number;
  sentShirts: number;
  sentOrders: number;
  notSentShirts: number;
  notSentOrders: number;
}

/** production_exported_at is per-ORDER (an order is sent to the factory as a whole), so every shirt in a sent order counts as sent. */
export function calculateProductionSummary(orders: ReportOrderInput[]): ProductionSummary {
  let paidShirts = 0;
  let sentShirts = 0;
  let sentOrders = 0;
  for (const order of orders) {
    const shirts = shirtCount(order);
    paidShirts += shirts;
    if (order.productionExportedAt !== null) {
      sentShirts += shirts;
      sentOrders += 1;
    }
  }
  const paidOrders = orders.length;
  return {
    paidShirts,
    paidOrders,
    sentShirts,
    sentOrders,
    notSentShirts: paidShirts - sentShirts,
    notSentOrders: paidOrders - sentOrders,
  };
}

export type ProductionFilter = "all" | "sent" | "not_sent";

export function filterOrdersByProductionStatus(orders: ReportOrderInput[], filter: ProductionFilter): ReportOrderInput[] {
  if (filter === "all") return orders;
  if (filter === "sent") return orders.filter((o) => o.productionExportedAt !== null);
  return orders.filter((o) => o.productionExportedAt === null);
}

// ── §10 Customization QA ────────────────────────────────────────────────

export interface CustomizationQaRow {
  orderNumber: string;
  customerName: string | null;
  colorName: string;
  sizeName: string;
  customName: string | null;
  customNumber: string | null;
  productionStatus: "Sent" | "Not sent";
}

/** One row per physical shirt (§10 "หนึ่งแถว = เสื้อหนึ่งตัว") — expands customizations exactly like the manufacturer export does, but keeps display-original names/casing rather than the manufacturer file's normalized lowercase. */
export function buildCustomizationQaRows(orders: ReportOrderInput[]): CustomizationQaRow[] {
  const rows: CustomizationQaRow[] = [];
  for (const order of orders) {
    const productionStatus: "Sent" | "Not sent" = order.productionExportedAt !== null ? "Sent" : "Not sent";
    for (const item of order.items) {
      const units = item.customizations ?? Array.from({ length: item.quantity }, () => ({ name: null, number: null }));
      for (const unit of units) {
        rows.push({
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          colorName: item.colorName,
          sizeName: item.sizeName,
          customName: unit.name,
          customNumber: unit.number,
          productionStatus,
        });
      }
    }
  }
  return rows;
}

// ── §11 Customization warnings ──────────────────────────────────────────

export type CustomizationWarningReason = "missing_name" | "missing_number" | "count_mismatch" | "missing_customizations";

export interface CustomizationWarning {
  orderNumber: string;
  customerName: string | null;
  colorName: string;
  sizeName: string;
  /** 1-based position of the affected shirt within this line item; 0 for an item-level issue (missing_customizations / count_mismatch) that isn't attributable to one specific unit. */
  shirtIndex: number;
  reason: CustomizationWarningReason;
}

const CUSTOMIZATION_WARNING_LABELS: Record<CustomizationWarningReason, string> = {
  missing_name: "Custom Name หาย",
  missing_number: "Custom Number หาย",
  count_mismatch: "customization count ไม่ตรงกับจำนวนเสื้อ",
  missing_customizations: "มีข้อมูล shirt item ไม่ครบ",
};

export function getCustomizationWarningLabel(reason: CustomizationWarningReason): string {
  return CUSTOMIZATION_WARNING_LABELS[reason];
}

/**
 * Flags shirts needing admin review — never auto-corrects anything (§11
 * "Report มีหน้าที่แจ้งให้ Admin ตรวจสอบเท่านั้น"). A blank name/number is
 * legitimately allowed by checkout (a customer may order a plain shirt),
 * this is a review signal for the admin to double-check before sending
 * to the factory, not a validation failure.
 */
export function findCustomizationWarnings(orders: ReportOrderInput[]): CustomizationWarning[] {
  const warnings: CustomizationWarning[] = [];
  for (const order of orders) {
    for (const item of order.items) {
      if (item.customizations === null) {
        warnings.push({
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          colorName: item.colorName,
          sizeName: item.sizeName,
          shirtIndex: 0,
          reason: "missing_customizations",
        });
        continue;
      }
      if (item.customizations.length !== item.quantity) {
        warnings.push({
          orderNumber: order.orderNumber,
          customerName: order.customerName,
          colorName: item.colorName,
          sizeName: item.sizeName,
          shirtIndex: 0,
          reason: "count_mismatch",
        });
      }
      item.customizations.forEach((unit, index) => {
        const nameBlank = unit.name === null || unit.name.trim() === "";
        const numberBlank = unit.number === null || unit.number.trim() === "";
        if (nameBlank) {
          warnings.push({
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            colorName: item.colorName,
            sizeName: item.sizeName,
            shirtIndex: index + 1,
            reason: "missing_name",
          });
        }
        if (numberBlank) {
          warnings.push({
            orderNumber: order.orderNumber,
            customerName: order.customerName,
            colorName: item.colorName,
            sizeName: item.sizeName,
            shirtIndex: index + 1,
            reason: "missing_number",
          });
        }
      });
    }
  }
  return warnings;
}

// ── §12 Needs Attention ──────────────────────────────────────────────────

export interface FlaggedOrder {
  orderNumber: string;
  customerName: string | null;
}

function isAddressComplete(address: ReportOrderAddressInput | null): boolean {
  if (!address) return false;
  const required = [address.addressLine, address.subdistrict, address.district, address.province, address.postalCode];
  return required.every((v) => v !== null && v.trim() !== "");
}

/** §12 "Missing Shipping Address" — paid orders whose address is missing or has any blank required field. */
export function findMissingAddressOrders(orders: ReportOrderInput[]): FlaggedOrder[] {
  return orders.filter((o) => !isAddressComplete(o.address)).map((o) => ({ orderNumber: o.orderNumber, customerName: o.customerName }));
}

/** §12 "Missing Customization" — paid orders with at least one findCustomizationWarnings() hit, deduplicated to one row per order (reuses §11's detection so the two sections can never disagree). */
export function findOrdersWithMissingCustomization(orders: ReportOrderInput[]): FlaggedOrder[] {
  const flagged = new Set(findCustomizationWarnings(orders).map((w) => w.orderNumber));
  return orders.filter((o) => flagged.has(o.orderNumber)).map((o) => ({ orderNumber: o.orderNumber, customerName: o.customerName }));
}

export interface NotSentToProductionSummary {
  orders: Array<FlaggedOrder & { shirts: number }>;
  totalOrders: number;
  totalShirts: number;
}

/** §12 "Not Sent to Production" — shows both order count and shirt count, since one order can hold many shirts. */
export function findNotSentToProductionOrders(orders: ReportOrderInput[]): NotSentToProductionSummary {
  const rows = orders
    .filter((o) => o.productionExportedAt === null)
    .map((o) => ({ orderNumber: o.orderNumber, customerName: o.customerName, shirts: shirtCount(o) }));
  return { orders: rows, totalOrders: rows.length, totalShirts: rows.reduce((sum, r) => sum + r.shirts, 0) };
}

// ── Top-level assembly ───────────────────────────────────────────────────

export interface AdminReportData {
  range: ResolvedReportRange;
  overview: ReportOverviewCards;
  salesOverTime: { granularity: ReportBucketGranularity; buckets: SalesOverTimeBucket[] };
  salesByColor: SalesByDimensionRow[];
  salesBySize: SalesByDimensionRow[];
  colorSizeMatrix: ColorSizeMatrix;
  production: {
    summary: ProductionSummary;
    matrices: Record<ProductionFilter, ColorSizeMatrix>;
  };
  customizationQa: CustomizationQaRow[];
  customizationWarnings: CustomizationWarning[];
  needsAttention: {
    missingAddress: FlaggedOrder[];
    missingCustomization: FlaggedOrder[];
    notSentToProduction: NotSentToProductionSummary;
  };
}

/** Assembles every report section from one already-paid-filtered order list — the single entry point get-admin-report-data.ts calls after fetching. */
export function buildAdminReport(
  orders: ReportOrderInput[],
  colorOrder: Map<string, number>,
  sizeOrder: Map<string, number>,
  range: ResolvedReportRange,
): AdminReportData {
  const granularity = resolveSalesOverTimeGranularity(orders, range);
  const sentOrders = filterOrdersByProductionStatus(orders, "sent");
  const notSentOrders = filterOrdersByProductionStatus(orders, "not_sent");

  return {
    range,
    overview: calculateOverviewCards(orders),
    salesOverTime: { granularity, buckets: calculateSalesOverTime(orders, granularity) },
    salesByColor: calculateSalesByColor(orders, colorOrder),
    salesBySize: calculateSalesBySize(orders, sizeOrder),
    colorSizeMatrix: calculateColorSizeMatrix(orders, colorOrder, sizeOrder),
    production: {
      summary: calculateProductionSummary(orders),
      matrices: {
        all: calculateColorSizeMatrix(orders, colorOrder, sizeOrder),
        sent: calculateColorSizeMatrix(sentOrders, colorOrder, sizeOrder),
        not_sent: calculateColorSizeMatrix(notSentOrders, colorOrder, sizeOrder),
      },
    },
    customizationQa: buildCustomizationQaRows(orders),
    customizationWarnings: findCustomizationWarnings(orders),
    needsAttention: {
      missingAddress: findMissingAddressOrders(orders),
      missingCustomization: findOrdersWithMissingCustomization(orders),
      notSentToProduction: findNotSentToProductionOrders(orders),
    },
  };
}
