"use client";

import { useState } from "react";
import Link from "next/link";
import { useCart } from "@/lib/cart/use-cart";
import { removeFromCart, addToCart } from "@/lib/cart/store";
import { formatSatangAsThb } from "@/lib/money";
import { CartItemRow } from "@/components/cart/cart-item-row";
import { CustomizationModal } from "@/components/product/customization-modal";
import type { JerseyProduct } from "@/lib/catalog/types";
import type { CartItem } from "@/lib/cart/schema";
import {
  allDraftsValid,
  resizeDrafts,
  resolveDraftsToGroups,
  type ShirtDraft,
} from "@/lib/customization/shirt-draft";
import { getAvailableColors, getImagesForColor } from "@/lib/catalog/resolve-variant";
import { getJerseyUnitPriceSatang } from "@/lib/pricing/jersey-tiers";

export function CartPageClient({ product }: { product: JerseyProduct | null }) {
  const { items, itemCount, unitPriceSatang, subtotalSatang } = useCart();
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editDrafts, setEditDrafts] = useState<ShirtDraft[]>([]);

  function openEdit(item: CartItem) {
    if (!product) return;
    const drafts: ShirtDraft[] = item.customizations.map((c, index) => {
      const variant = product.variants.find((v) => v.id === item.variantId);
      return {
        id: `${item.variantId}-${index}`,
        colorId: variant?.colorId ?? null,
        sizeId: variant?.sizeId ?? null,
        name: c.name ?? "",
        number: c.number ?? "",
      };
    });
    setEditDrafts(drafts);
    setEditingVariantId(item.variantId);
  }

  /**
   * Same safe resize logic as the product page (§ cart quantity editing):
   * growing appends blank shirts requiring color+size before they can be
   * saved; shrinking confirms first if any dropped shirt carried real
   * data, never silently destroying it.
   */
  function handleEditQuantityChange(next: number) {
    const clamped = Math.max(1, Math.min(100000, Math.trunc(next)));
    const { drafts: resized, droppedHadData } = resizeDrafts(editDrafts, clamped);
    if (droppedHadData) {
      const removedCount = editDrafts.length - clamped;
      const confirmed = window.confirm(
        `การลดจำนวนจะลบรายละเอียดของเสื้อ ${removedCount} ตัวล่าสุด ต้องการดำเนินการต่อหรือไม่?`,
      );
      if (!confirmed) return;
    }
    setEditDrafts(resized);
  }

  function commitEdit() {
    if (!product || !editingVariantId || !allDraftsValid(editDrafts)) return;
    const groups = resolveDraftsToGroups(editDrafts, product.variants, product.colors, product.sizes);
    if (!groups) return;

    // Replace the edited line entirely, then re-add the (possibly
    // re-colored/re-sized/re-grouped) shirts fresh — naturally handles a
    // customer changing a shirt's color/size mid-edit by splitting it
    // into a different variant line.
    removeFromCart(editingVariantId);
    const galleryByColor = new Map(
      product.colors.map((c) => [c.id, getImagesForColor(product.images, c.id)[0]?.url ?? null]),
    );
    const totalQtyAfterEdit =
      items.filter((i) => i.variantId !== editingVariantId).reduce((sum, i) => sum + i.quantity, 0) +
      groups.reduce((sum, g) => sum + g.customizations.length, 0);
    const groupUnitPrice = getJerseyUnitPriceSatang(totalQtyAfterEdit);
    for (const g of groups) {
      addToCart(
        {
          variantId: g.variant.id,
          productId: product.id,
          productSlug: product.slug,
          productName: product.name,
          colorName: g.color.name,
          sizeName: g.size.name,
          sku: g.variant.sku,
          unitPriceSatang: groupUnitPrice,
          imageUrl: galleryByColor.get(g.color.id) ?? null,
        },
        g.customizations,
      );
    }
    setEditingVariantId(null);
    setEditDrafts([]);
  }

  if (items.length === 0) {
    return (
      <section className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
        <h1 className="font-display text-3xl uppercase tracking-wide">Your cart is empty</h1>
        <p className="text-sm text-foreground/60">Find something you&apos;ll want to wear.</p>
        <Link
          href="/products/jersey"
          className="mt-4 inline-flex h-12 items-center justify-center bg-ink px-8 text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
        >
          Continue Shopping
        </Link>
      </section>
    );
  }

  return (
    <section className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-16">
      <h1 className="font-display text-3xl uppercase tracking-wide sm:text-4xl">Your Cart</h1>

      <div className="mt-8">
        {items.map((item) => (
          <CartItemRow
            key={item.variantId}
            item={item}
            unitPriceSatang={unitPriceSatang}
            onEdit={() => openEdit(item)}
            onRemove={() => removeFromCart(item.variantId)}
          />
        ))}
      </div>

      {/* Quantity-tier pricing (§4) — combined quantity across every
          size/color line determines a single per-shirt price for the
          whole cart. Recomputed live on every quantity change, never a
          stale cached price. */}
      <div className="mt-8 flex flex-col gap-3 border-t border-line pt-6">
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground/60">จำนวนสินค้า</span>
          <span className="font-medium tabular-nums">{itemCount} ตัว</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground/60">ราคาต่อชิ้น</span>
          <span className="font-medium tabular-nums">{formatSatangAsThb(unitPriceSatang)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground/60">ยอดสินค้า</span>
          <span className="font-medium tabular-nums">{formatSatangAsThb(subtotalSatang)}</span>
        </div>
        <div className="flex items-center justify-between text-sm">
          <span className="text-foreground/60">Shipping</span>
          <span className="text-foreground/60">Calculated at checkout</span>
        </div>
      </div>

      <Link
        href="/checkout"
        className="mt-8 flex h-14 w-full items-center justify-center bg-ink text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
      >
        Checkout
      </Link>

      {product && (
        <CustomizationModal
          open={editingVariantId !== null}
          onClose={() => setEditingVariantId(null)}
          drafts={editDrafts}
          onDraftsChange={setEditDrafts}
          colors={getAvailableColors(product.variants, product.colors)}
          sizes={product.sizes}
          canSave={allDraftsValid(editDrafts)}
          onSaveAndAddToCart={commitEdit}
          title="แก้ไขรายละเอียดเสื้อ"
          saveLabel="บันทึกการแก้ไข"
          quantityEditable
          onQuantityChange={handleEditQuantityChange}
        />
      )}
    </section>
  );
}
