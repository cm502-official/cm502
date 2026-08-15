"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { JerseyProduct } from "@/lib/catalog/types";
import {
  clampQuantity,
  getAvailableColors,
  getEffectivePriceSatang,
  getImagesForColor,
  getSizeStatesForColor,
  resolveVariant,
} from "@/lib/catalog/resolve-variant";
import { formatSatangAsThb } from "@/lib/money";
import { addToCart } from "@/lib/cart/store";
import { setBuyNowItem } from "@/lib/cart/buy-now";
import { ProductGallery } from "./product-gallery";
import { QuantityInput } from "@/components/ui/quantity-input";

export function JerseySelector({ product }: { product: JerseyProduct }) {
  const router = useRouter();
  const availableColors = useMemo(
    () => getAvailableColors(product.variants, product.colors),
    [product.variants, product.colors],
  );

  const [selectedColorId, setSelectedColorId] = useState<string | null>(availableColors[0]?.id ?? null);
  const [selectedSizeId, setSelectedSizeId] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [feedback, setFeedback] = useState<string | null>(null);

  const sizeStates = useMemo(
    () => getSizeStatesForColor(product.variants, product.sizes, selectedColorId),
    [product.variants, product.sizes, selectedColorId],
  );

  const selectedVariant = useMemo(
    () => resolveVariant(product.variants, selectedColorId, selectedSizeId),
    [product.variants, selectedColorId, selectedSizeId],
  );

  const images = useMemo(
    () => getImagesForColor(product.images, selectedColorId),
    [product.images, selectedColorId],
  );

  const stock = selectedVariant?.availableStock ?? null;
  const isSoldOut = selectedVariant !== null && selectedVariant.isActive && stock !== null && stock <= 0;
  const canPurchase = selectedVariant !== null && selectedVariant.isActive && !isSoldOut && quantity > 0;
  const priceSatang = getEffectivePriceSatang(product.basePriceSatang, selectedVariant);

  function handleSelectColor(colorId: string) {
    setSelectedColorId(colorId);
    setSelectedSizeId(null);
    setQuantity(1);
    setFeedback(null);
  }

  function handleSelectSize(sizeId: string) {
    setSelectedSizeId(sizeId);
    const variant = resolveVariant(product.variants, selectedColorId, sizeId);
    setQuantity(clampQuantity(1, variant?.availableStock ?? null) || 1);
    setFeedback(null);
  }

  function buildCartItem() {
    if (!selectedVariant || !selectedColorId || !selectedSizeId) return null;
    const color = product.colors.find((c) => c.id === selectedColorId);
    const size = product.sizes.find((s) => s.id === selectedSizeId);
    if (!color || !size) return null;
    return {
      variantId: selectedVariant.id,
      productId: product.id,
      productSlug: product.slug,
      productName: product.name,
      colorName: color.name,
      sizeName: size.name,
      sku: selectedVariant.sku,
      unitPriceSatang: priceSatang,
      imageUrl: images[0]?.url ?? null,
    };
  }

  function handleAddToCart() {
    const item = buildCartItem();
    if (!item) return;
    addToCart(item, quantity);
    setFeedback(`Added ${quantity} × ${item.colorName} / ${item.sizeName} to your cart.`);
  }

  function handleBuyNow() {
    const item = buildCartItem();
    if (!item) return;
    setBuyNowItem({ ...item, quantity });
    router.push("/checkout");
  }

  return (
    <div className="flex flex-col gap-8 lg:grid lg:grid-cols-2 lg:gap-16">
      <ProductGallery images={images} productName={product.name} />

      <div className="flex flex-col gap-6">
        <div>
          <h1 className="font-display text-4xl uppercase tracking-wide sm:text-5xl">{product.name}</h1>
          <p className="mt-2 text-xl font-medium tabular-nums">{formatSatangAsThb(priceSatang)}</p>
        </div>

        {/* Color selection — name is always shown as text, never conveyed by swatch color alone. */}
        <fieldset>
          <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
            Color{selectedColorId && `: ${product.colors.find((c) => c.id === selectedColorId)?.name ?? ""}`}
          </legend>
          <div className="mt-3 flex flex-wrap gap-3">
            {availableColors.map((color) => {
              const selected = color.id === selectedColorId;
              return (
                <button
                  key={color.id}
                  type="button"
                  onClick={() => handleSelectColor(color.id)}
                  aria-pressed={selected}
                  aria-label={color.name}
                  title={color.name}
                  className={`flex h-11 w-11 items-center justify-center border-2 transition-colors ${
                    selected ? "border-ink" : "border-transparent"
                  }`}
                >
                  <span
                    className="h-8 w-8 rounded-full border border-line"
                    style={{ backgroundColor: color.hexCode ?? "#ccc" }}
                  />
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Size selection */}
        <fieldset>
          <div className="flex items-center justify-between">
            <legend className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
              Size
            </legend>
            <SizeGuideDisclosure />
          </div>
          <div className="mt-3 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
            {sizeStates.map(({ size, disabled, soldOut }) => {
              const selected = size.id === selectedSizeId;
              return (
                <button
                  key={size.id}
                  type="button"
                  onClick={() => handleSelectSize(size.id)}
                  disabled={disabled}
                  aria-pressed={selected}
                  aria-label={soldOut ? `${size.name}, sold out` : size.name}
                  className={`relative flex h-12 min-w-14 items-center justify-center border px-3 text-sm font-medium transition-colors ${
                    selected ? "border-ink bg-ink text-paper" : "border-line"
                  } ${disabled ? "text-foreground/30" : ""}`}
                >
                  {size.name}
                  {soldOut && (
                    <span className="pointer-events-none absolute inset-x-1 top-1/2 h-px -translate-y-1/2 bg-current" aria-hidden />
                  )}
                </button>
              );
            })}
          </div>
        </fieldset>

        {/* Stock state */}
        <p className="text-sm" role="status">
          {!selectedSizeId && "Select a size to check availability."}
          {selectedSizeId && !selectedVariant && "This combination isn't available."}
          {selectedVariant && isSoldOut && <span className="font-medium text-accent">Sold out</span>}
          {selectedVariant &&
            !isSoldOut &&
            stock !== null &&
            stock <= 5 && <span className="text-accent">Only {stock} left</span>}
          {selectedVariant && !isSoldOut && (stock === null || stock > 5) && (
            <span className="text-foreground/60">In stock</span>
          )}
        </p>

        {/* Quantity */}
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">Quantity</p>
          <QuantityInput
            value={quantity}
            max={stock !== null ? Math.max(1, Math.min(stock, 10)) : 10}
            onChange={setQuantity}
            disabled={!canPurchase}
          />
        </div>

        {/* Purchase actions */}
        <div className="flex flex-col gap-3 pb-4 sm:flex-row">
          <button
            type="button"
            onClick={handleAddToCart}
            disabled={!canPurchase}
            className="h-14 flex-1 border border-ink text-sm font-semibold uppercase tracking-[0.15em] transition-opacity hover:opacity-70 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Add to Cart
          </button>
          <button
            type="button"
            onClick={handleBuyNow}
            disabled={!canPurchase}
            className="h-14 flex-1 bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80 disabled:cursor-not-allowed disabled:opacity-30"
          >
            Buy Now
          </button>
        </div>

        {feedback && (
          <p role="status" className="text-sm text-foreground/70">
            {feedback}
          </p>
        )}

        {(product.description || product.careInfo) && (
          <div className="flex flex-col gap-4 border-t border-line pt-6">
            {product.description && (
              <details open className="text-sm leading-relaxed text-foreground/80">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
                  Details
                </summary>
                <p className="mt-2">{product.description}</p>
              </details>
            )}
            {product.careInfo && (
              <details className="text-sm leading-relaxed text-foreground/80">
                <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
                  Care Information
                </summary>
                <p className="mt-2">{product.careInfo}</p>
              </details>
            )}
          </div>
        )}
      </div>

      {/* Sticky mobile purchase bar */}
      <div className="fixed inset-x-0 bottom-0 z-30 flex gap-3 border-t border-line bg-background/95 p-3 backdrop-blur sm:hidden">
        <button
          type="button"
          onClick={handleAddToCart}
          disabled={!canPurchase}
          className="h-12 flex-1 border border-ink text-xs font-semibold uppercase tracking-[0.15em] disabled:opacity-30"
        >
          Add to Cart
        </button>
        <button
          type="button"
          onClick={handleBuyNow}
          disabled={!canPurchase}
          className="h-12 flex-1 bg-ink text-xs font-semibold uppercase tracking-[0.15em] text-paper disabled:opacity-30"
        >
          Buy Now
        </button>
      </div>
      {/* Spacer so the sticky bar never covers content on mobile */}
      <div className="h-20 sm:hidden" aria-hidden />
    </div>
  );
}

function SizeGuideDisclosure() {
  return (
    <details className="relative">
      <summary className="cursor-pointer list-none text-xs font-medium uppercase tracking-[0.1em] text-foreground/60 underline underline-offset-4">
        Size Guide
      </summary>
      <div className="absolute right-0 top-full z-10 mt-2 w-64 border border-line bg-background p-4 text-xs shadow-lg">
        <table className="w-full text-left">
          <thead>
            <tr className="text-foreground/50">
              <th className="pb-2 font-medium">Size</th>
              <th className="pb-2 font-medium">Chest (in)</th>
              <th className="pb-2 font-medium">Length (in)</th>
            </tr>
          </thead>
          <tbody className="tabular-nums">
            <tr><td className="py-1">S</td><td>38</td><td>27</td></tr>
            <tr><td className="py-1">M</td><td>40</td><td>28</td></tr>
            <tr><td className="py-1">L</td><td>42</td><td>29</td></tr>
            <tr><td className="py-1">XL</td><td>44</td><td>30</td></tr>
          </tbody>
        </table>
        <p className="mt-2 text-foreground/50">Placeholder measurements — confirm before launch.</p>
      </div>
    </details>
  );
}
