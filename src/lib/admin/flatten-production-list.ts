/**
 * Pure, UI-agnostic transform — no I/O, fully unit-testable. Flattens an
 * order's variant-grouped line items back down into one row per physical
 * shirt, exactly what staff need to hand to production:
 *
 *   # | สี | ไซซ์ | ชื่อ | เบอร์
 *   1 | Black | M | LUCIFER | 88
 *   2 | Black | M | POND | 07
 *
 * Reads only the historical snapshot fields (color/size name snapshots +
 * the saved `customizations` jsonb) — never recomputed from live
 * catalog state, so a past order's production list stays accurate even
 * if colors/sizes change later.
 */
export interface ProductionSourceItem {
  colorNameSnapshot: string;
  sizeNameSnapshot: string;
  customizations: Array<{ name: string | null; number: string | null }> | null;
}

export interface ProductionRow {
  /** 1-based, order-preserving across every line item in the order. */
  index: number;
  colorName: string;
  sizeName: string;
  /** Raw stored value — "-" placeholder rendering is a UI concern, not this function's. */
  name: string | null;
  /** Raw stored value, e.g. "07" — never coerced to a number. */
  number: string | null;
}

export function flattenOrderItemsToProductionRows(items: ProductionSourceItem[]): ProductionRow[] {
  const rows: ProductionRow[] = [];
  let index = 0;
  for (const item of items) {
    for (const customization of item.customizations ?? []) {
      index += 1;
      rows.push({
        index,
        colorName: item.colorNameSnapshot,
        sizeName: item.sizeNameSnapshot,
        name: customization.name,
        number: customization.number,
      });
    }
  }
  return rows;
}
