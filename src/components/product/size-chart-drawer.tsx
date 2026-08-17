"use client";

import { Overlay } from "@/components/ui/overlay";
import { JERSEY_SIZE_CHART } from "@/lib/catalog/size-chart";

/**
 * Real, HTML size chart (not a reference image customers have to zoom
 * into) — every measurement is an actual table cell, so it stays legible
 * at any zoom level and works with a screen reader. Shares the Overlay
 * component with the pricing breakdown so both open/close consistently
 * (Escape, backdrop click, × button) without navigating or opening a
 * new tab.
 */
export function SizeChartDrawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Overlay open={open} onClose={onClose} title="ตารางไซซ์">
      <p className="text-xs text-foreground/50">หน่วย: นิ้ว (inches)</p>
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[280px] text-left text-sm">
          <thead>
            <tr className="border-b border-line text-xs uppercase tracking-wide text-foreground/50">
              <th className="py-2 pr-3 font-medium">ไซซ์</th>
              <th className="py-2 pr-3 font-medium">รอบอก (Chest)</th>
              <th className="py-2 font-medium">ความยาว (Length)</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            {JERSEY_SIZE_CHART.map((row) => (
              <tr key={row.size} className="border-b border-line/50 last:border-b-0">
                <td className="py-2 pr-3 font-medium">{row.size}</td>
                <td className="py-2 pr-3 text-foreground/80">{row.chestInches}&Prime;</td>
                <td className="py-2 text-foreground/80">{row.lengthInches}&Prime;</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Overlay>
  );
}
