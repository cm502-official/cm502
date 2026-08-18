"use client";

import { useRef } from "react";
import {
  PROOF_SLOTS,
  REQUIRED_PROOF_COUNT,
  type ProofType,
} from "@/lib/shipping-proofs/proof-types";
import { getShippingFeeSatang, type ShippingChoice } from "@/lib/shipping-proofs/shipping-choice";
import { formatSatangAsThb } from "@/lib/money";
import { INSTAGRAM_HANDLE, INSTAGRAM_URL, TIKTOK_HANDLE, TIKTOK_URL } from "@/lib/social/links";

export type ProofSlotStatus = "idle" | "compressing" | "ready" | "uploading" | "uploaded" | "error";

export interface ProofSlotState {
  status: ProofSlotStatus;
  previewUrl: string | null;
  errorMessage: string | null;
}

export const INITIAL_PROOF_SLOT_STATE: ProofSlotState = {
  status: "idle",
  previewUrl: null,
  errorMessage: null,
};

/**
 * Shipping-choice picker + (when free shipping is selected) the activity
 * instructions and 7 labeled proof-upload slots (§B–§G/§R). Purely
 * presentational — all compression/upload orchestration and state
 * ownership stays in CheckoutForm so submission can coordinate order
 * creation with the upload sequence; this component only renders state
 * and forwards user actions upward.
 */
export function ShippingChoiceSection({
  shippingChoice,
  onShippingChoiceChange,
  proofs,
  onProofFileSelect,
  onProofRemove,
  shippingChoiceError,
  proofsSummaryError,
}: {
  shippingChoice: ShippingChoice | null;
  onShippingChoiceChange: (choice: ShippingChoice) => void;
  proofs: Record<ProofType, ProofSlotState>;
  onProofFileSelect: (proofType: ProofType, file: File) => void;
  onProofRemove: (proofType: ProofType) => void;
  shippingChoiceError?: string;
  proofsSummaryError?: string;
}) {
  const completedCount = PROOF_SLOTS.filter(
    (s) => proofs[s.proofType]?.status === "ready" || proofs[s.proofType]?.status === "uploaded",
  ).length;

  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
        ตัวเลือกการจัดส่ง
      </legend>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <ShippingChoiceCard
          selected={shippingChoice === "free_social_proof"}
          onSelect={() => onShippingChoiceChange("free_social_proof")}
          title="ทำกิจกรรมรับสิทธิ์ส่งฟรี"
          price="฿0"
        />
        <ShippingChoiceCard
          selected={shippingChoice === "paid_shipping"}
          onSelect={() => onShippingChoiceChange("paid_shipping")}
          title="ไม่สะดวกทำ"
          price={`+${formatSatangAsThb(getShippingFeeSatang("paid_shipping"))}`}
        />
      </div>
      {shippingChoiceError && <p className="text-xs text-accent">{shippingChoiceError}</p>}

      {shippingChoice === "free_social_proof" && (
        <div className="flex flex-col gap-4 border border-white/15 bg-ink-soft p-4">
          <div className="flex flex-col gap-2 text-xs text-white/70">
            <p className="font-medium text-paper">ทำกิจกรรมให้ครบเพื่อรับสิทธิ์จัดส่งฟรี:</p>
            <div>
              <p className="font-medium text-paper/90">Instagram — {INSTAGRAM_HANDLE}</p>
              <ol className="ml-4 list-decimal">
                <li>Follow บัญชี Instagram</li>
                <li>Like โพสต์ที่กำหนด/ปักหมุด</li>
                <li>Share โพสต์ที่กำหนดลง Story</li>
              </ol>
            </div>
            <div>
              <p className="font-medium text-paper/90">TikTok — {TIKTOK_HANDLE}</p>
              <ol className="ml-4 list-decimal">
                <li>Follow บัญชี TikTok</li>
                <li>Like โพสต์ที่กำหนด/ปักหมุด</li>
                <li>Repost โพสต์ที่กำหนด</li>
                <li>Comment ใต้โพสต์ที่กำหนด</li>
              </ol>
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <SocialLinkButton href={INSTAGRAM_URL} label={`Instagram: ${INSTAGRAM_HANDLE}`} />
            <SocialLinkButton href={TIKTOK_URL} label={`TikTok: ${TIKTOK_HANDLE}`} />
          </div>

          <p role="status" aria-live="polite" className="text-sm font-medium text-paper">
            อัปโหลดหลักฐานครบ {completedCount}/{REQUIRED_PROOF_COUNT}
          </p>
          {proofsSummaryError && (
            <p role="alert" className="text-xs text-accent">
              {proofsSummaryError}
            </p>
          )}

          <ProofGroup
            heading="หลักฐาน Instagram"
            slots={PROOF_SLOTS.filter((s) => s.platform === "instagram")}
            proofs={proofs}
            onSelect={onProofFileSelect}
            onRemove={onProofRemove}
          />
          <ProofGroup
            heading="หลักฐาน TikTok"
            slots={PROOF_SLOTS.filter((s) => s.platform === "tiktok")}
            proofs={proofs}
            onSelect={onProofFileSelect}
            onRemove={onProofRemove}
          />
        </div>
      )}
    </fieldset>
  );
}

function ShippingChoiceCard({
  selected,
  onSelect,
  title,
  price,
}: {
  selected: boolean;
  onSelect: () => void;
  title: string;
  price: string;
}) {
  return (
    <label
      className={`flex cursor-pointer items-center justify-between gap-3 border p-4 text-sm transition-colors ${
        selected ? "border-white/70 bg-ink-soft" : "border-white/15 bg-ink"
      }`}
    >
      <span className="flex items-start gap-3">
        <input
          type="radio"
          name="shippingChoice"
          checked={selected}
          onChange={onSelect}
          className="mt-1"
          style={{ colorScheme: "dark" }}
        />
        <span className="font-medium text-paper">{title}</span>
      </span>
      <span className="flex-none font-medium tabular-nums text-paper">{price}</span>
    </label>
  );
}

function SocialLinkButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer nofollow"
      className="inline-flex h-10 items-center justify-center border border-white/20 px-4 text-xs font-semibold uppercase tracking-wide text-paper transition-colors hover:border-white/50"
    >
      {label}
    </a>
  );
}

function ProofGroup({
  heading,
  slots,
  proofs,
  onSelect,
  onRemove,
}: {
  heading: string;
  slots: typeof PROOF_SLOTS;
  proofs: Record<ProofType, ProofSlotState>;
  onSelect: (proofType: ProofType, file: File) => void;
  onRemove: (proofType: ProofType) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-[11px] font-semibold uppercase tracking-[0.15em] text-white/50">{heading}</h3>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {slots.map((slot) => (
          <ProofSlotCard
            key={slot.proofType}
            proofType={slot.proofType}
            label={slot.label}
            state={proofs[slot.proofType] ?? INITIAL_PROOF_SLOT_STATE}
            onSelect={(file) => onSelect(slot.proofType, file)}
            onRemove={() => onRemove(slot.proofType)}
          />
        ))}
      </div>
    </div>
  );
}

function ProofSlotCard({
  proofType,
  label,
  state,
  onSelect,
  onRemove,
}: {
  proofType: ProofType;
  label: string;
  state: ProofSlotState;
  onSelect: (file: File) => void;
  onRemove: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = `proof-${proofType}`;

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    // A single <input type="file"> without `multiple` already only ever
    // yields one file, but guard explicitly so a slot can never
    // accidentally end up holding more than one selection (§E).
    const file = e.target.files?.[0];
    if (file) onSelect(file);
    // Reset so re-selecting the exact same file still fires onChange.
    e.target.value = "";
  }

  const isBusy = state.status === "compressing" || state.status === "uploading";
  const isDone = state.status === "ready" || state.status === "uploaded";

  return (
    <div className="flex flex-col gap-1.5 border border-white/15 bg-ink p-2.5">
      <p className="text-[11px] font-medium text-paper/80">{label}</p>

      {state.previewUrl ? (
        <div className="relative aspect-[9/16] w-full max-w-[140px] self-center overflow-hidden bg-ink-soft">
          {/* eslint-disable-next-line @next/next/no-img-element -- local blob preview of a client-compressed screenshot, not an optimizable remote asset */}
          <img src={state.previewUrl} alt={label} className="h-full w-full object-contain" />
        </div>
      ) : (
        <div className="flex aspect-[9/16] w-full max-w-[140px] items-center justify-center self-center border border-dashed border-white/15 text-center text-[10px] text-white/35">
          ยังไม่ได้อัปโหลด
        </div>
      )}

      <input
        ref={inputRef}
        id={inputId}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleChange}
        disabled={isBusy}
        className="sr-only"
      />

      <div className="flex gap-1.5">
        <label
          htmlFor={inputId}
          className={`flex h-8 flex-1 cursor-pointer items-center justify-center border border-white/20 text-[10px] font-semibold uppercase tracking-wide text-paper transition-colors hover:border-white/50 ${
            isBusy ? "pointer-events-none opacity-50" : ""
          }`}
        >
          {isBusy ? "กำลังประมวลผล…" : state.previewUrl ? "เปลี่ยนรูป" : "เลือกรูป"}
        </label>
        {state.previewUrl && !isBusy && (
          <button
            type="button"
            onClick={onRemove}
            className="flex h-8 items-center justify-center border border-white/20 px-2 text-[10px] font-semibold uppercase tracking-wide text-paper/70 transition-colors hover:border-white/50"
          >
            ลบ
          </button>
        )}
      </div>

      <p className="text-[10px]" aria-live="polite">
        {state.status === "compressing" && <span className="text-white/50">กำลังบีบอัดรูปภาพ…</span>}
        {state.status === "uploading" && <span className="text-white/50">กำลังอัปโหลด…</span>}
        {state.status === "uploaded" && <span className="text-white/50">อัปโหลดแล้ว</span>}
        {state.status === "ready" && <span className="text-white/50">พร้อมส่ง</span>}
        {state.status === "error" && state.errorMessage && <span className="text-accent">{state.errorMessage}</span>}
      </p>
      {isDone && <span className="sr-only">{label}: อัปโหลดสำเร็จ</span>}
    </div>
  );
}
