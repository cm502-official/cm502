"use client";

import { useState } from "react";
import type { Color, Size } from "@/lib/catalog/types";
import {
  countComplete,
  NAME_MAX_LENGTH,
  validateDraftFields,
  type ShirtDraft,
} from "@/lib/customization/shirt-draft";

/**
 * The shared per-shirt customization table/card list — used both for a
 * new purchase (product page, quantity chosen beforehand) and for
 * editing an existing cart line (fixed shirt count). One row layout that
 * reflows from a card (mobile) to a table-like grid (desktop) via CSS
 * alone, rather than maintaining two separate markups (§13).
 */
export function ShirtCustomizationEditor({
  drafts,
  onChange,
  colors,
  sizes,
}: {
  drafts: ShirtDraft[];
  onChange: (drafts: ShirtDraft[]) => void;
  colors: Color[];
  sizes: Size[];
}) {
  const [bulkColorId, setBulkColorId] = useState<string>(colors[0]?.id ?? "");
  const [bulkSizeId, setBulkSizeId] = useState<string>(sizes[0]?.id ?? "");

  function updateDraft(id: string, patch: Partial<ShirtDraft>) {
    onChange(drafts.map((d) => (d.id === id ? { ...d, ...patch } : d)));
  }

  function applyColorToAll() {
    if (!bulkColorId) return;
    onChange(drafts.map((d) => ({ ...d, colorId: bulkColorId })));
  }

  function applySizeToAll() {
    if (!bulkSizeId) return;
    onChange(drafts.map((d) => ({ ...d, sizeId: bulkSizeId })));
  }

  function copyFromPrevious(index: number) {
    if (index === 0) return;
    const prev = drafts[index - 1];
    updateDraft(drafts[index].id, { colorId: prev.colorId, sizeId: prev.sizeId });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Progress (§11) — NAME/NUMBER don't count toward completeness, only color+size. */}
      <p className="text-sm text-foreground/70">
        กรอกแล้ว <span className="font-medium text-foreground">{countComplete(drafts)}</span> / {drafts.length} ตัว
      </p>

      {/* Bulk convenience tools (§12) — optional, never a separate flow. */}
      {drafts.length > 1 && (
        <div className="flex flex-col gap-2 border border-line p-3 sm:flex-row sm:items-center sm:gap-4">
          <div className="flex items-center gap-2">
            <select
              value={bulkColorId}
              onChange={(e) => setBulkColorId(e.target.value)}
              className="h-9 border border-line bg-background px-2 text-xs outline-none focus:border-foreground"
              aria-label="Bulk color"
            >
              {colors.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applyColorToAll}
              className="h-9 border border-line px-3 text-xs font-medium uppercase tracking-wide transition-colors hover:border-foreground"
            >
              ใช้สีเดียวกันทุกตัว
            </button>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={bulkSizeId}
              onChange={(e) => setBulkSizeId(e.target.value)}
              className="h-9 border border-line bg-background px-2 text-xs outline-none focus:border-foreground"
              aria-label="Bulk size"
            >
              {sizes.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={applySizeToAll}
              className="h-9 border border-line px-3 text-xs font-medium uppercase tracking-wide transition-colors hover:border-foreground"
            >
              ใช้ไซซ์เดียวกันทุกตัว
            </button>
          </div>
        </div>
      )}

      {/* Column header — desktop only; mobile rows carry their own field labels. */}
      <div className="hidden text-xs font-semibold uppercase tracking-[0.1em] text-foreground/50 md:grid md:grid-cols-[2.5rem_1fr_1fr_1fr_1fr_5.5rem] md:gap-3 md:px-1">
        <span>#</span>
        <span>สี</span>
        <span>ไซซ์</span>
        <span>ชื่อบนเสื้อ</span>
        <span>เบอร์</span>
        <span />
      </div>

      <ul className="flex flex-col divide-y divide-line border-t border-line">
        {drafts.map((draft, index) => {
          const errors = validateDraftFields(draft);
          return (
            <li
              key={draft.id}
              className="grid grid-cols-2 gap-x-3 gap-y-2 py-3 md:grid-cols-[2.5rem_1fr_1fr_1fr_1fr_5.5rem] md:items-center md:gap-3"
            >
              <span className="col-span-2 text-xs font-semibold text-foreground/60 md:col-span-1 md:text-sm">
                ตัวที่ {index + 1}
              </span>

              <label className="flex flex-col gap-1 text-xs text-foreground/50 md:contents">
                <span className="md:hidden">สี</span>
                <select
                  value={draft.colorId ?? ""}
                  onChange={(e) => updateDraft(draft.id, { colorId: e.target.value || null })}
                  className="h-10 border border-line bg-background px-2 text-sm outline-none focus:border-foreground"
                  aria-label={`Shirt ${index + 1} color`}
                >
                  <option value="">เลือกสี</option>
                  {colors.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-foreground/50 md:contents">
                <span className="md:hidden">ไซซ์</span>
                <select
                  value={draft.sizeId ?? ""}
                  onChange={(e) => updateDraft(draft.id, { sizeId: e.target.value || null })}
                  className="h-10 border border-line bg-background px-2 text-sm outline-none focus:border-foreground"
                  aria-label={`Shirt ${index + 1} size`}
                >
                  <option value="">เลือกไซซ์</option>
                  {sizes.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-xs text-foreground/50 md:contents">
                <span className="md:hidden">ชื่อบนเสื้อ</span>
                <input
                  type="text"
                  value={draft.name}
                  onChange={(e) => updateDraft(draft.id, { name: e.target.value })}
                  placeholder="เช่น LUCIFER"
                  maxLength={NAME_MAX_LENGTH + 5}
                  aria-label={`Shirt ${index + 1} name`}
                  aria-invalid={Boolean(errors.name)}
                  className={`h-10 border bg-background px-2 text-sm outline-none focus:border-foreground ${
                    errors.name ? "border-accent" : "border-line"
                  }`}
                />
                {errors.name && <span className="text-[11px] text-accent">{errors.name}</span>}
              </label>

              <label className="flex flex-col gap-1 text-xs text-foreground/50 md:contents">
                <span className="md:hidden">เบอร์</span>
                <input
                  type="text"
                  inputMode="numeric"
                  value={draft.number}
                  onChange={(e) => updateDraft(draft.id, { number: e.target.value.replace(/[^\d]/g, "").slice(0, 2) })}
                  placeholder="เช่น 10"
                  aria-label={`Shirt ${index + 1} number`}
                  aria-invalid={Boolean(errors.number)}
                  className={`h-10 w-full border bg-background px-2 text-sm outline-none focus:border-foreground md:w-20 ${
                    errors.number ? "border-accent" : "border-line"
                  }`}
                />
                {errors.number && <span className="text-[11px] text-accent">{errors.number}</span>}
              </label>

              <div className="col-span-2 md:col-span-1">
                {index > 0 && (
                  <button
                    type="button"
                    onClick={() => copyFromPrevious(index)}
                    className="text-[11px] font-medium uppercase tracking-wide text-foreground/50 underline underline-offset-4 transition-colors hover:text-foreground"
                  >
                    คัดลอกจากตัวก่อนหน้า
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
