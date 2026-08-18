"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import Link from "next/link";
import { useCart } from "@/lib/cart/use-cart";
import { clearCart } from "@/lib/cart/store";
import { getBuyNowItems, clearBuyNowItems } from "@/lib/cart/buy-now";
import type { CartItem } from "@/lib/cart/schema";
import { addSatang, formatSatangAsThb } from "@/lib/money";
import { addressSchema, customerSchema } from "@/lib/validation/checkout";
import {
  findSubdistrictById,
  getDistrictsByProvince,
  getProvinces,
  getSubdistrictsByDistrict,
} from "@/lib/thai-address";
import type { ShippingMethod } from "@/lib/shipping/get-shipping-methods";
import { ORDER_ERROR_MESSAGES, type OrderErrorCode } from "@/lib/orders/errors";
import { calculateJerseySubtotalSatang, getJerseyUnitPriceSatang } from "@/lib/pricing/jersey-tiers";
import { PROOF_SLOTS, type ProofType } from "@/lib/shipping-proofs/proof-types";
import { getShippingFeeSatang, type ShippingChoice } from "@/lib/shipping-proofs/shipping-choice";
import {
  compressProofImage,
  ImageCompressionError,
  validateOriginalFile,
} from "@/lib/media/image-compression";
import {
  INITIAL_PROOF_SLOT_STATE,
  ShippingChoiceSection,
  type ProofSlotState,
} from "./shipping-choice-section";

interface FormState {
  fullName: string;
  phone: string;
  lineId: string;
  email: string;
  addressLine: string;
  soiRoad: string;
  // Kept as select-driven strings ("" = unselected) — the dataset id,
  // not free text; canonical Thai names + postal code are resolved
  // server-side from these (§ thai-address).
  provinceId: string;
  districtId: string;
  subdistrictId: string;
  postalCode: string;
  deliveryNote: string;
}

const INITIAL_FORM: FormState = {
  fullName: "",
  phone: "",
  lineId: "",
  email: "",
  addressLine: "",
  soiRoad: "",
  provinceId: "",
  districtId: "",
  subdistrictId: "",
  postalCode: "",
  deliveryNote: "",
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** Internal proof-slot state — extends the display-only ProofSlotState
 * with the actual compressed blob/mime, which the upload step needs but
 * the presentational component never touches directly. */
interface ProofSlotFull extends ProofSlotState {
  blob: Blob | null;
  mimeType: string | null;
}

function createInitialProofState(): Record<ProofType, ProofSlotFull> {
  return Object.fromEntries(
    PROOF_SLOTS.map((s) => [s.proofType, { ...INITIAL_PROOF_SLOT_STATE, blob: null, mimeType: null }]),
  ) as Record<ProofType, ProofSlotFull>;
}

function originalFileErrorMessage(reason: "empty" | "too_large" | "unsupported_format"): string {
  switch (reason) {
    case "empty":
      return "ไฟล์นี้ว่างเปล่า กรุณาเลือกไฟล์ภาพอื่น";
    case "too_large":
      return "ไฟล์มีขนาดใหญ่เกินไป (สูงสุด 15 MB)";
    case "unsupported_format":
      return "รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP เท่านั้น";
  }
}

function compressionErrorMessage(reason: string): string {
  if (reason === "too_large_after_compression") {
    return "ไม่สามารถบีบอัดรูปให้เล็กพอได้ กรุณาใช้ภาพหน้าจอที่เล็กกว่านี้";
  }
  return "ไม่สามารถประมวลผลรูปภาพนี้ได้ กรุณาลองใหม่อีกครั้ง";
}

function extensionForMime(mimeType: string | null): string {
  if (mimeType === "image/jpeg") return "jpg";
  if (mimeType === "image/png") return "png";
  return "webp";
}

export function CheckoutForm({ shippingMethods }: { shippingMethods: ShippingMethod[] }) {
  const router = useRouter();
  const cart = useCart();

  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState<"buyNow" | "cart">("cart");
  const [buyNowItems, setBuyNowItemsState] = useState<CartItem[] | null>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(shippingMethods[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // §B/§K — the effective shipping fee comes entirely from this choice
  // (getShippingFeeSatang), never from the selected shipping_methods row
  // — see shipping-choice.ts for why. Starts unselected: the customer
  // must make a deliberate pick, matching every other required field's
  // "no default" treatment.
  const [shippingChoice, setShippingChoice] = useState<ShippingChoice | null>(null);
  const [proofs, setProofs] = useState<Record<ProofType, ProofSlotFull>>(createInitialProofState);
  const [proofsSummaryError, setProofsSummaryError] = useState<string | null>(null);
  // Set once /api/orders has actually created the order — after that,
  // retrying failed proof uploads must never re-POST /api/orders (§V: no
  // duplicate order from repeated submits), only re-attempt the missing
  // uploads against this same order.
  const [createdOrder, setCreatedOrder] = useState<{ trackingToken: string } | null>(null);

  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());

  // sessionStorage only exists client-side, so the buy-now slot can only be
  // read after mount — reading it during render would mismatch the SSR
  // pass. This is a one-time synchronization with an external system
  // (exactly what effects are for), not state derived from props/state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const items = getBuyNowItems();
    if (items && items.length > 0) {
      setBuyNowItemsState(items);
      setSource("buyNow");
    } else {
      setSource("cart");
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const items: CartItem[] = useMemo(
    () => (source === "buyNow" && buyNowItems ? buyNowItems : cart.items),
    [source, buyNowItems, cart.items],
  );

  // Quantity-tier pricing (§ jersey-tiers): the checkout total is
  // recomputed from the combined quantity across every line, not summed
  // from each line's stored unitPriceSatang — that keeps the number the
  // customer sees in lockstep with the server's authoritative
  // calculation even if a stale per-line price ever slipped through.
  // The server independently recomputes this at order-creation time
  // regardless (§ server-authoritative pricing) — this is display only.
  const totalQuantity = useMemo(() => items.reduce((sum, i) => sum + i.quantity, 0), [items]);
  const unitPriceSatang = useMemo(() => getJerseyUnitPriceSatang(totalQuantity), [totalQuantity]);
  const subtotalSatang = useMemo(() => calculateJerseySubtotalSatang(totalQuantity), [totalQuantity]);
  // §K/§L: the CHARGED/displayed fee comes from the shipping-choice
  // promo, not shippingMethod.priceSatang — a shipping method is still
  // selected/stored for its name, but no longer prices the order. The
  // total updates immediately as soon as the customer picks either
  // option, without waiting for proof uploads to finish (§K).
  const shippingSatang = shippingChoice ? getShippingFeeSatang(shippingChoice) : null;
  const totalSatang = addSatang(subtotalSatang, shippingSatang ?? 0);

  // Thai administrative dropdowns (§2) — each list is derived purely
  // from the currently selected parent id, entirely client-side (no
  // network request), so a stale child from a previously selected
  // province/district can never be shown alongside a new parent.
  const provinces = useMemo(() => getProvinces(), []);
  const districts = useMemo(
    () => getDistrictsByProvince(form.provinceId ? Number(form.provinceId) : null),
    [form.provinceId],
  );
  const subdistricts = useMemo(
    () => getSubdistrictsByDistrict(form.districtId ? Number(form.districtId) : null),
    [form.districtId],
  );

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }

  // Changing a parent selector clears every dependent value below it
  // (§5) — a District/Subdistrict/Postal code left over from a
  // different Province would silently describe the wrong address.
  function handleProvinceChange(value: string) {
    setForm((prev) => ({ ...prev, provinceId: value, districtId: "", subdistrictId: "", postalCode: "" }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.provinceId;
      delete next.districtId;
      delete next.subdistrictId;
      delete next.postalCode;
      return next;
    });
  }

  function handleDistrictChange(value: string) {
    setForm((prev) => ({ ...prev, districtId: value, subdistrictId: "", postalCode: "" }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.districtId;
      delete next.subdistrictId;
      delete next.postalCode;
      return next;
    });
  }

  // Postal code auto-fills from the chosen Subdistrict (§6) — there's no
  // legitimate reason for it to differ in this dataset (every
  // subdistrict maps to exactly one zip code), so it's derived here
  // rather than left independently editable.
  function handleSubdistrictChange(value: string) {
    const subdistrict = findSubdistrictById(value ? Number(value) : null);
    setForm((prev) => ({ ...prev, subdistrictId: value, postalCode: subdistrict?.zipCode ?? "" }));
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next.subdistrictId;
      delete next.postalCode;
      return next;
    });
  }

  function setProofSlot(proofType: ProofType, patch: Partial<ProofSlotFull>) {
    setProofs((prev) => ({ ...prev, [proofType]: { ...prev[proofType], ...patch } }));
    setProofsSummaryError(null);
  }

  // §F/§H: compress client-side immediately on selection — the customer
  // sees the (compressed) preview and any error right away, well before
  // ever submitting the order.
  async function handleProofFileSelect(proofType: ProofType, file: File) {
    const previous = proofs[proofType];
    if (previous.previewUrl) URL.revokeObjectURL(previous.previewUrl);

    const originalCheck = validateOriginalFile(file.size, file.type);
    if (!originalCheck.valid) {
      setProofSlot(proofType, {
        status: "error",
        previewUrl: null,
        blob: null,
        mimeType: null,
        errorMessage: originalFileErrorMessage(originalCheck.reason),
      });
      return;
    }

    setProofSlot(proofType, { status: "compressing", errorMessage: null });
    try {
      const { blob, metadata } = await compressProofImage(file);
      setProofSlot(proofType, {
        status: "ready",
        previewUrl: URL.createObjectURL(blob),
        blob,
        mimeType: metadata.mimeType,
        errorMessage: null,
      });
    } catch (err) {
      const reason = err instanceof ImageCompressionError ? err.reason : "unknown";
      setProofSlot(proofType, {
        status: "error",
        previewUrl: null,
        blob: null,
        mimeType: null,
        errorMessage: compressionErrorMessage(reason),
      });
    }
  }

  function handleProofRemove(proofType: ProofType) {
    const previous = proofs[proofType];
    if (previous.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    setProofSlot(proofType, { ...INITIAL_PROOF_SLOT_STATE, blob: null, mimeType: null });
  }

  function allProofsReady(current: Record<ProofType, ProofSlotFull>): boolean {
    return PROOF_SLOTS.every((s) => {
      const status = current[s.proofType].status;
      return status === "ready" || status === "uploaded";
    });
  }

  // Uploads whichever proofs aren't already marked "uploaded" against an
  // already-created order (§V/§H) — safe to call again on retry without
  // ever re-creating the order or re-uploading a slot that already
  // succeeded.
  async function uploadPendingProofs(trackingToken: string): Promise<boolean> {
    let allSucceeded = true;

    for (const slot of PROOF_SLOTS) {
      const current = proofs[slot.proofType];
      if (current.status === "uploaded") continue;
      if (!current.blob) {
        allSucceeded = false;
        continue;
      }

      setProofSlot(slot.proofType, { status: "uploading", errorMessage: null });
      try {
        const form = new FormData();
        form.set("proofType", slot.proofType);
        form.set("file", current.blob, `${slot.proofType}.${extensionForMime(current.mimeType)}`);

        const res = await fetch(`/api/orders/${trackingToken}/shipping-proofs`, {
          method: "POST",
          body: form,
        });
        const body = await res.json().catch(() => null);

        if (!res.ok || !body?.uploaded) {
          allSucceeded = false;
          setProofSlot(slot.proofType, {
            status: "error",
            errorMessage: body?.error?.message ?? "อัปโหลดหลักฐานไม่สำเร็จ กรุณาลองใหม่อีกครั้ง",
          });
          continue;
        }

        setProofSlot(slot.proofType, { status: "uploaded", errorMessage: null });
      } catch {
        allSucceeded = false;
        setProofSlot(slot.proofType, { status: "error", errorMessage: "เครือข่ายมีปัญหา กรุณาลองใหม่อีกครั้ง" });
      }
    }

    return allSucceeded;
  }

  function validate(): boolean {
    const errors: Record<string, string> = {};

    const customerResult = customerSchema.safeParse({
      fullName: form.fullName,
      phone: form.phone,
      lineId: form.lineId,
      email: form.email,
    });
    if (!customerResult.success) {
      for (const issue of customerResult.error.issues) {
        errors[String(issue.path[0])] = issue.message;
      }
    }

    const addressResult = addressSchema.safeParse({
      addressLine: form.addressLine,
      soiRoad: form.soiRoad,
      provinceId: form.provinceId,
      districtId: form.districtId,
      subdistrictId: form.subdistrictId,
      postalCode: form.postalCode,
      deliveryNote: form.deliveryNote,
    });
    if (!addressResult.success) {
      for (const issue of addressResult.error.issues) {
        const key = String(issue.path[0]);
        // Keep the very first message per field (e.g. don't let the
        // hierarchy refine's message clobber a more specific "select a
        // subdistrict" one that already fired for the same field).
        if (!errors[key]) errors[key] = issue.message;
      }
    }

    if (!shippingMethodId) {
      errors.shippingMethodId = "กรุณาเลือกวิธีจัดส่ง";
    }

    if (!shippingChoice) {
      errors.shippingChoice = "กรุณาเลือกวิธีจัดส่ง";
    }

    setFieldErrors(errors);

    // §Q: free shipping requires exactly all 7 proof categories locally
    // ready (compressed, not yet necessarily uploaded) before the order
    // can even be submitted — checked separately from fieldErrors since
    // it's a summary banner, not one field.
    let proofsOk = true;
    if (shippingChoice === "free_social_proof" && !allProofsReady(proofs)) {
      proofsOk = false;
      setProofsSummaryError("กรุณาอัปโหลดหลักฐานให้ครบทั้ง 7 รูปเพื่อรับสิทธิ์ส่งฟรี");
      // Mark exactly which slots are still missing (§Q) — never clobber
      // a slot that already has its own more specific compression error.
      setProofs((prev) => {
        const next = { ...prev };
        for (const s of PROOF_SLOTS) {
          const status = next[s.proofType].status;
          if (status !== "ready" && status !== "uploaded" && status !== "error") {
            next[s.proofType] = { ...next[s.proofType], errorMessage: "ต้องอัปโหลดหลักฐานนี้" };
          }
        }
        return next;
      });
    } else {
      setProofsSummaryError(null);
    }

    return Object.keys(errors).length === 0 && proofsOk;
  }

  function finishAndNavigate(trackingToken: string) {
    if (source === "buyNow") {
      clearBuyNowItems();
    } else {
      clearCart();
    }
    router.push(`/orders/${trackingToken}`);
  }

  // §V: a partial proof-upload failure must never be silently treated as
  // a complete free-shipping submission, and must never trigger a second
  // /api/orders call (which would either double-create or, thanks to
  // idempotency, harmlessly no-op — but retry should still skip straight
  // to just the missing uploads rather than repeat the whole request).
  async function handleRetryUploads() {
    if (!createdOrder || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    const allUploaded = await uploadPendingProofs(createdOrder.trackingToken);
    setSubmitting(false);
    if (allUploaded) {
      finishAndNavigate(createdOrder.trackingToken);
    } else {
      setSubmitError("อัปโหลดหลักฐานบางรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // guards against double-click double-submit

    // Order already exists (an earlier attempt got through order
    // creation but some proof uploads failed) — never re-create it.
    if (createdOrder) {
      await handleRetryUploads();
      return;
    }

    setSubmitError(null);

    if (items.length === 0) {
      setSubmitError(ORDER_ERROR_MESSAGES.EMPTY_CART);
      return;
    }
    if (!validate()) return;

    setSubmitting(true);
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          idempotencyKey: idempotencyKeyRef.current,
          items: items.map((i) => ({
            variantId: i.variantId,
            quantity: i.quantity,
            customizations: i.customizations,
          })),
          customer: {
            fullName: form.fullName,
            phone: form.phone,
            lineId: form.lineId,
            email: form.email,
          },
          address: {
            addressLine: form.addressLine,
            soiRoad: form.soiRoad,
            provinceId: form.provinceId,
            districtId: form.districtId,
            subdistrictId: form.subdistrictId,
            postalCode: form.postalCode,
            deliveryNote: form.deliveryNote,
          },
          shippingMethodId,
          shippingChoice,
        }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.order) {
        const code: OrderErrorCode = body?.error?.code ?? "ORDER_CREATION_FAILED";
        setSubmitError(body?.error?.message ?? ORDER_ERROR_MESSAGES[code] ?? ORDER_ERROR_MESSAGES.ORDER_CREATION_FAILED);
        setSubmitting(false);
        return;
      }

      const trackingToken: string = body.order.trackingToken;

      if (body.order.shippingChoice === "free_social_proof") {
        // Order exists now — every retry from here on targets this same
        // order/token, never creates another one (§H/§V).
        setCreatedOrder({ trackingToken });
        const allUploaded = await uploadPendingProofs(trackingToken);
        setSubmitting(false);
        if (!allUploaded) {
          setSubmitError("สร้างคำสั่งซื้อสำเร็จ แต่อัปโหลดหลักฐานบางรายการไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
          return;
        }
      }

      finishAndNavigate(trackingToken);
    } catch {
      setSubmitError(ORDER_ERROR_MESSAGES.SERVICE_UNAVAILABLE);
      setSubmitting(false);
    }
  }

  if (!hydrated) {
    return <div className="py-24 text-center text-sm text-foreground/50">Loading checkout…</div>;
  }

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center gap-4 py-24 text-center">
        <h2 className="font-display text-2xl uppercase tracking-wide">Your cart is empty</h2>
        <Link
          href="/products/jersey"
          className="mt-2 inline-flex h-12 items-center justify-center bg-ink px-8 text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
        >
          Continue Shopping
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-10">
      <OrderSummary
        items={items}
        totalQuantity={totalQuantity}
        unitPriceSatang={unitPriceSatang}
        subtotalSatang={subtotalSatang}
        shippingSatang={shippingSatang}
        totalSatang={totalSatang}
      />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
          ข้อมูลผู้รับ
        </legend>
        <Field
          label="ชื่อ-นามสกุลผู้รับ"
          name="fullName"
          value={form.fullName}
          onChange={updateField}
          error={fieldErrors.fullName}
          required
          autoComplete="name"
        />
        <Field
          label="เบอร์โทรศัพท์"
          name="phone"
          value={form.phone}
          onChange={updateField}
          error={fieldErrors.phone}
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
        />
        <Field label="LINE ID (ถ้ามี)" name="lineId" value={form.lineId} onChange={updateField} error={fieldErrors.lineId} />
        <Field
          label="อีเมล"
          name="email"
          value={form.email}
          onChange={updateField}
          error={fieldErrors.email}
          required
          type="email"
          autoComplete="email"
        />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
          ที่อยู่จัดส่ง
        </legend>
        <Field
          label="บ้านเลขที่ / อาคาร / หมู่บ้าน / ห้อง"
          name="addressLine"
          value={form.addressLine}
          onChange={updateField}
          error={fieldErrors.addressLine}
          required
          autoComplete="street-address"
        />
        <Field
          label="ซอย / ถนน (ถ้ามี)"
          name="soiRoad"
          value={form.soiRoad}
          onChange={updateField}
          error={fieldErrors.soiRoad}
        />

        {/* Dependent Thai address selectors (§2): Province → District →
            Subdistrict → Postal code, entirely client-side, no free text. */}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="จังหวัด"
            placeholder="เลือกจังหวัด"
            value={form.provinceId}
            onChange={handleProvinceChange}
            error={fieldErrors.provinceId}
            required
            options={provinces.map((p) => ({ value: String(p.id), label: p.nameTh }))}
          />
          <SelectField
            label="อำเภอ / เขต"
            placeholder="เลือกอำเภอ / เขต"
            value={form.districtId}
            onChange={handleDistrictChange}
            error={fieldErrors.districtId}
            required
            disabled={!form.provinceId}
            options={districts.map((d) => ({ value: String(d.id), label: d.nameTh }))}
          />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label="ตำบล / แขวง"
            placeholder="เลือกตำบล / แขวง"
            value={form.subdistrictId}
            onChange={handleSubdistrictChange}
            error={fieldErrors.subdistrictId}
            required
            disabled={!form.districtId}
            options={subdistricts.map((s) => ({ value: String(s.id), label: s.nameTh }))}
          />
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <label htmlFor="field-postalCode" className="text-xs font-medium text-foreground/70">
                รหัสไปรษณีย์
              </label>
              {form.postalCode && (
                <span className="rounded-full border border-white/15 bg-ink-soft px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-white/60">
                  อัตโนมัติ
                </span>
              )}
            </div>
            <input
              id="field-postalCode"
              name="postalCode"
              value={form.postalCode}
              readOnly
              placeholder="กรอกอัตโนมัติ"
              aria-describedby="field-postalCode-hint"
              aria-invalid={Boolean(fieldErrors.postalCode)}
              style={{ colorScheme: "dark" }}
              className={`h-12 cursor-not-allowed border bg-ink px-3 text-sm text-paper/80 outline-none ${
                fieldErrors.postalCode ? "border-accent" : "border-white/10"
              }`}
            />
            {fieldErrors.postalCode ? (
              <p className="text-xs text-accent">{fieldErrors.postalCode}</p>
            ) : (
              <p id="field-postalCode-hint" className="text-xs text-foreground/40">
                กรอกอัตโนมัติจากตำบล/แขวงที่เลือก
              </p>
            )}
          </div>
        </div>

        <Field
          label="หมายเหตุสำหรับการจัดส่ง (ถ้ามี)"
          name="deliveryNote"
          value={form.deliveryNote}
          onChange={updateField}
          error={fieldErrors.deliveryNote}
          placeholder="เช่น ฝากไว้กับ รปภ. / โทรก่อนจัดส่ง"
          maxLength={200}
        />
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Shipping Method
        </legend>
        {shippingMethods.length === 0 && (
          <p className="text-sm text-accent">No shipping methods are available right now.</p>
        )}
        {shippingMethods.map((method) => (
          <label
            key={method.id}
            className={`flex cursor-pointer items-center justify-between gap-3 border p-4 text-sm ${
              shippingMethodId === method.id ? "border-ink" : "border-line"
            }`}
          >
            <span className="flex items-start gap-3">
              <input
                type="radio"
                name="shippingMethodId"
                value={method.id}
                checked={shippingMethodId === method.id}
                onChange={() => setShippingMethodId(method.id)}
                className="mt-1"
              />
              <span>
                <span className="block font-medium">{method.name}</span>
                {method.description && (
                  <span className="block text-xs text-foreground/60">{method.description}</span>
                )}
              </span>
            </span>
          </label>
        ))}
        {fieldErrors.shippingMethodId && <p className="text-xs text-accent">{fieldErrors.shippingMethodId}</p>}
      </fieldset>

      {/* §B–§R: the actual shipping fee decision — free (with social
          proof) vs paid ฿60. Placed after the address/method fieldsets
          and before the submit button, per §R's suggested layout. */}
      <ShippingChoiceSection
        shippingChoice={shippingChoice}
        onShippingChoiceChange={setShippingChoice}
        proofs={proofs}
        onProofFileSelect={handleProofFileSelect}
        onProofRemove={handleProofRemove}
        shippingChoiceError={fieldErrors.shippingChoice}
        proofsSummaryError={proofsSummaryError ?? undefined}
      />

      {submitError && (
        <p role="alert" className="border border-accent/40 bg-accent/5 p-3 text-sm text-accent">
          {submitError}
        </p>
      )}

      <button
        type="submit"
        disabled={submitting}
        className="h-14 w-full bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {createdOrder
          ? submitting
            ? "กำลังอัปโหลดหลักฐาน…"
            : "ลองอัปโหลดหลักฐานอีกครั้ง"
          : submitting
            ? "Placing order…"
            : `Place Order — ${formatSatangAsThb(totalSatang)}`}
      </button>
    </form>
  );
}

/**
 * Checkout must show the exact color image the customer selected — never
 * an arbitrary/default product image (§17). The cart item already carries
 * the correct per-color `imageUrl`, so this just renders it with the same
 * broken-image fallback used elsewhere (§14).
 */
function CheckoutItemThumbnail({ item }: { item: CartItem }) {
  const [imageFailed, setImageFailed] = useState(false);

  return (
    <div className="relative h-14 w-12 flex-none bg-paper-dim">
      {item.imageUrl && !imageFailed ? (
        <Image
          src={item.imageUrl}
          alt={`${item.productName} – ${item.colorName}`}
          fill
          sizes="48px"
          className="object-cover"
          onError={() => setImageFailed(true)}
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center">
          <span className="font-display text-[9px] text-ink/25">CM502</span>
        </div>
      )}
    </div>
  );
}

function OrderSummary({
  items,
  totalQuantity,
  unitPriceSatang,
  subtotalSatang,
  shippingSatang,
  totalSatang,
}: {
  items: CartItem[];
  totalQuantity: number;
  unitPriceSatang: number;
  subtotalSatang: number;
  shippingSatang: number | null;
  totalSatang: number;
}) {
  return (
    <div className="border border-line p-5">
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.variantId} className="flex gap-3 text-sm">
            <CheckoutItemThumbnail item={item} />
            <div className="flex-1">
              <div className="flex items-start justify-between gap-3">
                <span>
                  {item.productName}
                  <span className="text-foreground/60">
                    {" "}
                    — {item.colorName} / {item.sizeName} × {item.quantity}
                  </span>
                </span>
                <span className="flex-none tabular-nums">{formatSatangAsThb(unitPriceSatang * item.quantity)}</span>
              </div>
              {/* Per-shirt personalization preserved through checkout (§20). */}
              <ol className="mt-1 flex flex-col gap-0.5 text-xs text-foreground/60">
                {item.customizations.map((c, index) => (
                  <li key={index}>
                    - {c.name ?? "ไม่ระบุชื่อ"} · #{c.number ?? "ไม่ระบุเบอร์"}
                  </li>
                ))}
              </ol>
            </div>
          </li>
        ))}
      </ul>
      {/* Quantity-tier breakdown (§5) — total shirt count across every
          size/color line, the tier price it unlocks, and the resulting
          product subtotal, shown before shipping/total. */}
      <div className="mt-4 flex flex-col gap-1 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-foreground/60">จำนวนเสื้อทั้งหมด</span>
          <span className="tabular-nums">{totalQuantity} ตัว</span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground/60">ราคาต่อชิ้น</span>
          <span className="tabular-nums">{formatSatangAsThb(unitPriceSatang)}</span>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-foreground/60">ยอดรวมสินค้า</span>
          <span className="tabular-nums">{formatSatangAsThb(subtotalSatang)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground/60">ค่าจัดส่ง</span>
          <span className="tabular-nums">
            {shippingSatang !== null ? formatSatangAsThb(shippingSatang) : "Select a method"}
          </span>
        </div>
        <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-semibold">
          <span>ยอดชำระทั้งหมด</span>
          <span className="tabular-nums">{formatSatangAsThb(totalSatang)}</span>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  name,
  value,
  onChange,
  error,
  required,
  type = "text",
  autoComplete,
  inputMode,
  maxLength,
  placeholder,
}: {
  label: string;
  name: keyof FormState;
  value: string;
  onChange: <K extends keyof FormState>(key: K, value: string) => void;
  error?: string;
  required?: boolean;
  type?: string;
  autoComplete?: string;
  inputMode?: React.HTMLAttributes<HTMLInputElement>["inputMode"];
  maxLength?: number;
  placeholder?: string;
}) {
  const id = `field-${name}`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-foreground/70">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        value={value}
        onChange={(e) => onChange(name, e.target.value)}
        required={required}
        autoComplete={autoComplete}
        inputMode={inputMode}
        maxLength={maxLength}
        placeholder={placeholder}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        // Explicit dark colors (not the theme-following bg-background /
        // border-line tokens) — checkout inputs must render the same
        // black CM502 surface regardless of the visitor's OS/browser
        // light-or-dark preference. color-scheme: dark additionally
        // keeps native browser-drawn chrome (the autofill highlight in
        // particular) dark instead of the default light-yellow overlay.
        style={{ colorScheme: "dark" }}
        className={`h-12 border bg-ink px-3 text-sm text-paper placeholder:text-white/35 outline-none focus:border-white/60 ${
          error ? "border-accent" : "border-white/15"
        }`}
      />
      {error && (
        <p id={errorId} className="text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The dependent-dropdown control for Province/District/Subdistrict (§2/§5).
 * Disabled + a distinct placeholder before its parent is chosen, so the
 * customer can never open a stale/empty list. h-12 matches Field's input
 * height and keeps every row on the same touch-friendly grid.
 */
function SelectField({
  label,
  placeholder,
  value,
  onChange,
  error,
  required,
  disabled,
  options,
}: {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  required?: boolean;
  disabled?: boolean;
  options: Array<{ value: string; label: string }>;
}) {
  const id = `field-select-${label}`;
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-xs font-medium text-foreground/70">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        // Same explicit-dark rationale as Field above — this is also
        // what keeps the native <option> popup itself dark instead of
        // the browser default white listbox.
        style={{ colorScheme: "dark" }}
        // "Reduced opacity" for the disabled look is done with an opaque,
        // slightly lighter solid shade (bg-ink-soft) rather than a CSS
        // opacity/alpha utility — opacity on a solid background blends
        // with whatever sits *behind* the page (which follows the
        // visitor's OS light/dark preference elsewhere on the site), so
        // it can wash out to gray on a light backdrop. An opaque color
        // swap can never do that.
        className={`h-12 border bg-ink px-3 text-sm text-paper outline-none focus:border-white/60 disabled:cursor-not-allowed disabled:border-white/10 disabled:bg-ink-soft disabled:text-white/40 ${
          error ? "border-accent" : "border-white/15"
        }`}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {error && (
        <p id={errorId} className="text-xs text-accent">
          {error}
        </p>
      )}
    </div>
  );
}
