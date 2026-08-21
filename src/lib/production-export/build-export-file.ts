/**
 * Multi-order (bulk) production export file assembly (§12) — layered on
 * top of buildProductionExportRows so a single order's export and a
 * bulk export always normalize/expand shirts identically.
 */
import {
  buildProductionExportRows,
  formatProductionRow,
  type ProductionExportItemInput,
  type ProductionExportRowError,
  type ProductionRow,
} from "./build-export-rows";

export interface ProductionExportOrderInput {
  orderNumber: string;
  items: ProductionExportItemInput[];
}

export interface OrderProductionRows {
  orderNumber: string;
  rows: ProductionRow[];
  errors: ProductionExportRowError[];
}

/** Per-order rows, each order's sequence restarting at 1 (§7 "sequence starts at 1"). */
export function buildBulkProductionExportRows(orders: ProductionExportOrderInput[]): OrderProductionRows[] {
  return orders.map((order) => {
    const { rows, errors } = buildProductionExportRows(order.items);
    return { orderNumber: order.orderNumber, rows, errors };
  });
}

/**
 * §12 grouped mode (default, recommended): each order's block is preceded
 * by a `# ORDER-NUMBER` header line, sequence restarts at 1 per order —
 * a human or a script can still split on `# ` if needed, but every line
 * on its own is either a header or a clean SEQUENCE/COLOR/SIZE/NAME/NUMBER
 * row, never a mix.
 */
export function formatBulkProductionExportGrouped(orders: OrderProductionRows[]): string {
  const blocks = orders.map((order) => {
    const header = `# ${order.orderNumber}`;
    const lines = order.rows.map(formatProductionRow);
    return [header, ...lines].join("\n");
  });
  return blocks.join("\n");
}

/**
 * §12 raw mode ("ไม่มีหัวข้อ") — strictly slash-separated lines, no order
 * headers at all, for a manufacturer intake that can't handle anything
 * else. Since there's no other way to tell orders apart in this mode,
 * shirts are renumbered continuously across the whole batch rather than
 * repeating "1" for every order (which would otherwise look like
 * duplicate shirt #1s in one flat list).
 */
export function formatBulkProductionExportRaw(orders: ProductionExportOrderInput[]): string {
  const allItems = orders.flatMap((o) => o.items);
  const { rows } = buildProductionExportRows(allItems, 1);
  return rows.map(formatProductionRow).join("\n");
}

/** True if any order in the batch has a row-level error (corrupt customization) — callers should block the download and surface these. */
export function collectBulkExportErrors(orders: OrderProductionRows[]): Array<{ orderNumber: string; errors: ProductionExportRowError[] }> {
  return orders.filter((o) => o.errors.length > 0).map((o) => ({ orderNumber: o.orderNumber, errors: o.errors }));
}
