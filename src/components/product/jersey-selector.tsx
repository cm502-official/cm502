"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { JerseyProduct } from "@/lib/catalog/types";
import { getAvailableColors, getImagesForColor, isColorSoldOut } from "@/lib/catalog/resolve-variant";
import {
  calculateJerseySubtotalSatang,
  getJerseyPriceRangeSatang,
  getJerseyUnitPriceSatang,
} from "@/lib/pricing/jersey-tiers";
import { formatSatangAsThb } from "@/lib/money";
import { addToCart } from "@/lib/cart/store";
import { setBuyNowItems } from "@/lib/cart/buy-now";
import type { CartItem } from "@/lib/cart/schema";
import {
  allDraftsValid,
  resizeDrafts,
  resolveDraftsToGroups,
  type ShirtDraft,
} from "@/lib/customization/shirt-draft";
import { ProductGallery } from "./product-gallery";
import { SizeChartDrawer } from "./size-chart-drawer";
import { PricingModal } from "./pricing-modal";
import { CustomizationModal } from "./customization-modal";

export function JerseySelector({ product }: { product: JerseyProduct }) {
  const router = useRouter();
  const availableColors = useMemo(
    () => getAvailableColors(product.variants, product.colors),
    [product.variants, product.colors],
  );

  // Browsing color only — switches the gallery image set. Does NOT
  // determine any shirt's purchased color (§2); that's chosen per shirt
  // inside the customization modal.
  const [browsingColorId, setBrowsingColorId] = useState<string | null>(availableColors[0]?.id ?? null);
  const images = useMemo(
    () => getImagesForColor(product.images, browsingColorId),
    [product.images, browsingColorId],
  );

  // Total quantity is the FIRST thing the customer picks (§1). Per-shirt
  // drafts are resized to match, preserving already-customized shirts
  // (§14) — persisted here in the parent so they survive the
  // customization modal being closed and reopened (§3).
  const [quantity, setQuantity] = useState(0);
  const [drafts, setDrafts] = useState<ShirtDraft[]>([]);
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [sizeChartOpen, setSizeChartOpen] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  const priceRange = useMemo(() => getJerseyPriceRangeSatang(), []);
  const unitPriceSatang = getJerseyUnitPriceSatang(quantity);
  const subtotalSatang = calculateJerseySubtotalSatang(quantity);

  function handleQuantityChange(next: number) {
    const clamped = Math.max(0, Math.min(100000, Math.trunc(next)));
    const { drafts: resized, droppedHadData } = resizeDrafts(drafts, clamped);
    if (droppedHadData) {
      const removedCount = drafts.length - clamped;
      const confirmed = window.confirm(
        `การลดจำนวนจะลบรายละเอียดของเสื้อ ${removedCount} ตัวล่าสุด ต้องการดำเนินการต่อหรือไม่?`,
      );
      if (!confirmed) return;
    }
    setDrafts(resized);
    setQuantity(clamped);
    setFeedback(null);
  }

  function openCustomization() {
    if (quantity <= 0) return;
    if (drafts.length !== quantity) {
      setDrafts(resizeDrafts(drafts, quantity).drafts);
    }
    setCustomizeOpen(true);
  }

  function buildCartItemsFromDrafts(): CartItem[] | null {
    const groups = resolveDraftsToGroups(drafts, product.variants, product.colors, product.sizes);
    if (!groups) return null;
    const totalQty = groups.reduce((sum, g) => sum + g.customizations.length, 0);
    const groupUnitPrice = getJerseyUnitPriceSatang(totalQty);
    const galleryByColor = new Map(
      product.colors.map((c) => [c.id, getImagesForColor(product.images, c.id)[0]?.url ?? null]),
    );
    return groups.map((g) => ({
      variantId: g.variant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      colorName: g.color.name,
      sizeName: g.size.name,
      sku: g.variant.sku,
      unitPriceSatang: groupUnitPrice,
      imageUrl: galleryByColor.get(g.color.id) ?? null,
      quantity: g.customizations.length,
      customizations: g.customizations,
    }));
  }

  function handleSaveAndAddToCart() {
    if (!allDraftsValid(drafts)) return;
    const items = buildCartItemsFromDrafts();
    if (!items) return;
    for (const item of items) {
      addToCart(item, item.customizations);
    }
    setCustomizeOpen(false);
    setFeedback(`Added ${quantity} customized shirt${quantity > 1 ? "s" : ""} to your cart.`);
    setQuantity(0);
    setDrafts([]);
  }

  function handleBuyNow() {
    if (!allDraftsValid(drafts)) return;
    const items = buildCartItemsFromDrafts();
    if (!items) return;
    setBuyNowItems(items);
    setCustomizeOpen(false);
    router.push("/checkout");
  }

  const canOpenCustomization = quantity > 0;

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-[minmax(0,3fr)_minmax(380px,2fr)] lg:items-start lg:gap-14">
      <ProductGallery images={images} productName={product.name} />

      <div className="flex flex-col gap-6 lg:sticky lg:top-24">
        <div className="flex flex-col gap-3">
          <h1 className="font-display text-4xl uppercase tracking-wide sm:text-5xl">{product.name}</h1>

          {product.isPreorder ? (
            <div>
              <p className="text-xl font-medium tabular-nums">
                {formatSatangAsThb(priceRange.minSatang)}–{formatSatangAsThb(priceRange.maxSatang)}
                <span className="text-sm font-normal text-foreground/50"> / ตัว</span>
              </p>
              <p className="mt-1 text-xs text-foreground/50">ราคาต่อชิ้น ขึ้นอยู่กับจำนวนที่สั่ง</p>
              <button
                type="button"
                onClick={() => setPricingModalOpen(true)}
                className="mt-1 text-xs font-medium underline underline-offset-4 text-foreground/70 transition-colors hover:text-foreground"
              >
                ดูราคาตามจำนวน
              </button>
            </div>
          ) : (
            <p className="text-xl font-medium tabular-nums">{formatSatangAsThb(product.basePriceSatang)}</p>
          )}

          {product.isPreorder && (
            <p className="inline-flex w-fit items-center gap-1.5 border border-line px-2.5 py-1 text-[11px] uppercase tracking-[0.1em] text-foreground/60">
              พรีออเดอร์ <span aria-hidden>·</span> สั่งได้ไม่จำกัดจำนวน
            </p>
          )}
        </div>

        {/* Color previews — browsing only, controls the gallery image set.
            The actual purchased color/size for each shirt is chosen
            per-shirt inside the customization modal (§2/§9). */}
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
            Color{browsingColorId && `: ${product.colors.find((c) => c.id === browsingColorId)?.name ?? ""}`}
          </legend>
          <div className="mt-2.5 flex flex-wrap gap-3">
            {availableColors.map((color) => {
              const selected = color.id === browsingColorId;
              const soldOut = !product.isPreorder && isColorSoldOut(product.variants, color.id);
              return (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => setBrowsingColorId(color.id)}
                  aria-pressed={selected}
                  title={color.name}
                  className="relative flex h-9 w-9 items-center justify-center"
                >
                  <span
                    className={`h-7 w-7 rounded-full border ${soldOut ? "opacity-35" : ""} ${
                      selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "border-line"
                    }`}
                    style={{ backgroundColor: color.hexCode ?? "#ccc" }}
                  />
                  <span className="sr-only">{color.name}</span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">Size</span>
            <button
              type="button"
              onClick={() => setSizeChartOpen(true)}
              className="text-xs font-medium underline underline-offset-4 text-foreground/60 transition-colors hover:text-foreground"
            >
              ดูตารางไซซ์
            </button>
          </div>
          <p className="mt-1 text-xs text-foreground/50">เลือกไซซ์และสีแยกสำหรับเสื้อแต่ละตัวในขั้นตอนถัดไป</p>
        </div>

        {/* Quantity-first purchase flow (§1) — total shirt count is the
            main decision here; per-shirt color/size/name/number happens
            in the customization modal. */}
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
            จำนวนเสื้อทั้งหมด
          </legend>
          <div className="mt-2.5 inline-flex items-center border border-line" role="group" aria-label="Total quantity">
            <button
              type="button"
              onClick={() => handleQuantityChange(quantity - 1)}
              disabled={quantity <= 0}
              aria-label="Decrease total quantity"
              className="flex h-12 w-12 items-center justify-center text-lg disabled:opacity-30"
            >
              −
            </button>
            <input
              type="text"
              inputMode="numeric"
              value={quantity}
              onChange={(e) => {
                const digits = e.target.value.replace(/[^\d]/g, "");
                handleQuantityChange(digits === "" ? 0 : Number.parseInt(digits, 10));
              }}
              aria-label="Total quantity"
              className="h-12 w-16 border-x border-line bg-transparent text-center text-base font-medium tabular-nums outline-none"
            />
            <button
              type="button"
              onClick={() => handleQuantityChange(quantity + 1)}
              aria-label="Increase total quantity"
              className="flex h-12 w-12 items-center justify-center text-lg"
            >
              +
            </button>
          </div>
        </fieldset>

        {/* Live purchase summary — only once at least one shirt is
            selected (§12/§1); mirrors the exact tier price/subtotal. */}
        <div aria-live="polite" className="min-h-[2.5rem]">
          {quantity > 0 ? (
            <div className="text-sm">
              <p className="tabular-nums">
                {quantity} ตัว · <span className="font-medium">{formatSatangAsThb(unitPriceSatang)}</span> / ตัว
              </p>
              <p className="mt-0.5 tabular-nums text-foreground/60">รวมสินค้า {formatSatangAsThb(subtotalSatang)}</p>
            </div>
          ) : (
            <p className="text-xs text-foreground/40">เลือกจำนวนที่ต้องการสั่งซื้อ</p>
          )}
        </div>

        <button
          type="button"
          onClick={openCustomization}
          disabled={!canOpenCustomization}
          className="h-14 w-full bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
        >
          ระบุรายละเอียดเสื้อ{quantity > 0 ? ` · ${quantity} ตัว` : ""}
        </button>

        {feedback && (
          <p role="status" className="text-sm text-foreground/70">
            {feedback}
          </p>
        )}

        {(product.description || product.careInfo) && (
          <div className="flex flex-col border-t border-line pt-2">
            {product.description && (
              <details className="border-b border-line py-3 text-sm leading-relaxed text-foreground/80">
                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
                  รายละเอียดสินค้า
                </summary>
                <p className="mt-2">{product.description}</p>
              </details>
            )}
            {product.careInfo && (
              <details className="border-b border-line py-3 text-sm leading-relaxed text-foreground/80">
                <summary className="cursor-pointer list-none text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
                  Care Information
                </summary>
                <p className="mt-2">{product.careInfo}</p>
              </details>
            )}
          </div>
        )}
      </div>

      {product.isPreorder && (
        <PricingModal open={pricingModalOpen} onClose={() => setPricingModalOpen(false)} totalQuantity={quantity} />
      )}
      <SizeChartDrawer open={sizeChartOpen} onClose={() => setSizeChartOpen(false)} />
      <CustomizationModal
        open={customizeOpen}
        onClose={() => setCustomizeOpen(false)}
        drafts={drafts}
        onDraftsChange={setDrafts}
        colors={product.colors}
        sizes={product.sizes}
        canSave={allDraftsValid(drafts)}
        onSaveAndAddToCart={handleSaveAndAddToCart}
        onBuyNow={handleBuyNow}
      />

      {/* Sticky mobile purchase bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-background/95 p-3 backdrop-blur sm:hidden">
        <button
          type="button"
          onClick={openCustomization}
          disabled={!canOpenCustomization}
          className="h-12 w-full bg-ink text-xs font-semibold uppercase tracking-[0.15em] text-paper disabled:opacity-30"
        >
          ระบุรายละเอียดเสื้อ{quantity > 0 ? ` · ${quantity} ตัว` : ""}
        </button>
      </div>
      {/* Spacer so the sticky bar never covers content on mobile */}
      <div className="h-20 sm:hidden" aria-hidden />
    </div>
  );
}
