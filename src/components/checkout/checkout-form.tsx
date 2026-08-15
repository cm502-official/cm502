"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useCart } from "@/lib/cart/use-cart";
import { clearCart } from "@/lib/cart/store";
import { getBuyNowItem, clearBuyNowItem } from "@/lib/cart/buy-now";
import type { CartItem } from "@/lib/cart/schema";
import { addSatang, formatSatangAsThb } from "@/lib/money";
import { addressSchema, customerSchema } from "@/lib/validation/checkout";
import type { ShippingMethod } from "@/lib/shipping/get-shipping-methods";
import { ORDER_ERROR_MESSAGES, type OrderErrorCode } from "@/lib/orders/errors";

interface FormState {
  fullName: string;
  phone: string;
  lineId: string;
  email: string;
  addressLine: string;
  subdistrict: string;
  district: string;
  province: string;
  postalCode: string;
}

const INITIAL_FORM: FormState = {
  fullName: "",
  phone: "",
  lineId: "",
  email: "",
  addressLine: "",
  subdistrict: "",
  district: "",
  province: "",
  postalCode: "",
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `key-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutForm({ shippingMethods }: { shippingMethods: ShippingMethod[] }) {
  const router = useRouter();
  const cart = useCart();

  const [hydrated, setHydrated] = useState(false);
  const [source, setSource] = useState<"buyNow" | "cart">("cart");
  const [buyNowItem, setBuyNowItemState] = useState<CartItem | null>(null);

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [shippingMethodId, setShippingMethodId] = useState<string | null>(shippingMethods[0]?.id ?? null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const idempotencyKeyRef = useRef<string>(generateIdempotencyKey());

  // sessionStorage only exists client-side, so the buy-now slot can only be
  // read after mount — reading it during render would mismatch the SSR
  // pass. This is a one-time synchronization with an external system
  // (exactly what effects are for), not state derived from props/state.
  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    const item = getBuyNowItem();
    if (item) {
      setBuyNowItemState(item);
      setSource("buyNow");
    } else {
      setSource("cart");
    }
    setHydrated(true);
  }, []);
  /* eslint-enable react-hooks/set-state-in-effect */

  const items: CartItem[] = useMemo(
    () => (source === "buyNow" && buyNowItem ? [buyNowItem] : cart.items),
    [source, buyNowItem, cart.items],
  );

  const subtotalSatang = useMemo(
    () => items.reduce((sum, i) => sum + i.unitPriceSatang * i.quantity, 0),
    [items],
  );
  const shippingMethod = shippingMethods.find((m) => m.id === shippingMethodId) ?? null;
  const shippingSatang = shippingMethod?.priceSatang ?? 0;
  const totalSatang = addSatang(subtotalSatang, shippingSatang);

  function updateField<K extends keyof FormState>(key: K, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => {
      if (!prev[key]) return prev;
      const next = { ...prev };
      delete next[key];
      return next;
    });
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
      subdistrict: form.subdistrict,
      district: form.district,
      province: form.province,
      postalCode: form.postalCode,
    });
    if (!addressResult.success) {
      for (const issue of addressResult.error.issues) {
        errors[String(issue.path[0])] = issue.message;
      }
    }

    if (!shippingMethodId) {
      errors.shippingMethodId = "Select a shipping method";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submitting) return; // guards against double-click double-submit
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
          items: items.map((i) => ({ variantId: i.variantId, quantity: i.quantity })),
          customer: {
            fullName: form.fullName,
            phone: form.phone,
            lineId: form.lineId,
            email: form.email,
          },
          address: {
            addressLine: form.addressLine,
            subdistrict: form.subdistrict,
            district: form.district,
            province: form.province,
            postalCode: form.postalCode,
          },
          shippingMethodId,
        }),
      });

      const body = await response.json().catch(() => null);

      if (!response.ok || !body?.order) {
        const code: OrderErrorCode = body?.error?.code ?? "ORDER_CREATION_FAILED";
        setSubmitError(body?.error?.message ?? ORDER_ERROR_MESSAGES[code] ?? ORDER_ERROR_MESSAGES.ORDER_CREATION_FAILED);
        setSubmitting(false);
        return;
      }

      if (source === "buyNow") {
        clearBuyNowItem();
      } else {
        clearCart();
      }

      router.push(`/orders/${body.order.trackingToken}`);
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
      <OrderSummary items={items} subtotalSatang={subtotalSatang} shippingSatang={shippingMethod ? shippingSatang : null} totalSatang={totalSatang} />

      <fieldset className="flex flex-col gap-4">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Contact
        </legend>
        <Field label="Full name" name="fullName" value={form.fullName} onChange={updateField} error={fieldErrors.fullName} required autoComplete="name" />
        <Field label="Phone number" name="phone" value={form.phone} onChange={updateField} error={fieldErrors.phone} required type="tel" autoComplete="tel" />
        <Field label="LINE ID (optional)" name="lineId" value={form.lineId} onChange={updateField} error={fieldErrors.lineId} />
        <Field label="Email (optional)" name="email" value={form.email} onChange={updateField} error={fieldErrors.email} type="email" autoComplete="email" />
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Shipping Address
        </legend>
        <Field label="Address" name="addressLine" value={form.addressLine} onChange={updateField} error={fieldErrors.addressLine} required autoComplete="street-address" />
        <div className="grid grid-cols-2 gap-4">
          <Field label="Subdistrict" name="subdistrict" value={form.subdistrict} onChange={updateField} error={fieldErrors.subdistrict} required />
          <Field label="District" name="district" value={form.district} onChange={updateField} error={fieldErrors.district} required />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Province" name="province" value={form.province} onChange={updateField} error={fieldErrors.province} required />
          <Field label="Postal code" name="postalCode" value={form.postalCode} onChange={updateField} error={fieldErrors.postalCode} required inputMode="numeric" maxLength={5} />
        </div>
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
            <span className="font-medium tabular-nums">{formatSatangAsThb(method.priceSatang)}</span>
          </label>
        ))}
        {fieldErrors.shippingMethodId && <p className="text-xs text-accent">{fieldErrors.shippingMethodId}</p>}
      </fieldset>

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
        {submitting ? "Placing order…" : `Place Order — ${formatSatangAsThb(totalSatang)}`}
      </button>
    </form>
  );
}

function OrderSummary({
  items,
  subtotalSatang,
  shippingSatang,
  totalSatang,
}: {
  items: CartItem[];
  subtotalSatang: number;
  shippingSatang: number | null;
  totalSatang: number;
}) {
  return (
    <div className="border border-line p-5">
      <ul className="flex flex-col gap-3">
        {items.map((item) => (
          <li key={item.variantId} className="flex items-center justify-between text-sm">
            <span>
              {item.productName}
              <span className="text-foreground/60">
                {" "}
                — {item.colorName} / {item.sizeName} × {item.quantity}
              </span>
            </span>
            <span className="tabular-nums">{formatSatangAsThb(item.unitPriceSatang * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-col gap-1.5 border-t border-line pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-foreground/60">Subtotal</span>
          <span className="tabular-nums">{formatSatangAsThb(subtotalSatang)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-foreground/60">Shipping</span>
          <span className="tabular-nums">
            {shippingSatang !== null ? formatSatangAsThb(shippingSatang) : "Select a method"}
          </span>
        </div>
        <div className="mt-1 flex justify-between border-t border-line pt-2 text-base font-semibold">
          <span>Total</span>
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
        aria-invalid={Boolean(error)}
        aria-describedby={error ? errorId : undefined}
        className={`h-12 border bg-background px-3 text-sm outline-none focus:border-ink ${
          error ? "border-accent" : "border-line"
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
