import "server-only";

import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";
import type { JerseyProduct } from "./types";

/**
 * The one loader the storefront needs for Phase 2: everything to render
 * /products/jersey and drive variant selection, in a single structured
 * object. Uses the anon/RLS server client — every table it reads is
 * public-read for active rows (see 0002_rls.sql), so this works for
 * anonymous visitors with no special auth.
 *
 * Returns null if the product doesn't exist / isn't published, or if
 * Supabase isn't reachable (no live project connected yet, network
 * failure, etc.) — callers render the appropriate empty/error state and
 * never see a raw Postgres/Supabase error.
 */
export async function getJerseyProduct(): Promise<JerseyProduct | null> {
  try {
    return await loadJerseyProduct();
  } catch {
    // No Supabase project connected yet, invalid env, network failure,
    // unexpected query shape — all collapse to the same customer-safe
    // "unavailable" outcome. Never let a raw Supabase/env error reach the
    // page (§23/§29).
    return null;
  }
}

async function loadJerseyProduct(): Promise<JerseyProduct | null> {
  const supabase = await createClient();

  const { data: product, error: productError } = await supabase
    .from("products")
    .select("id, slug, name, description, care_info, base_price_satang, is_preorder")
    .eq("slug", "jersey")
    .eq("is_active", true)
    .maybeSingle();

  if (productError || !product) return null;

  const [{ data: colors }, { data: sizes }, { data: variants }, { data: images }, { data: stockRows }] =
    await Promise.all([
      supabase.from("colors").select("id, name, hex_code, sort_order").order("sort_order"),
      supabase.from("sizes").select("id, name, sort_order").order("sort_order"),
      supabase
        .from("product_variants")
        .select("id, color_id, size_id, sku, price_satang_override, is_active")
        .eq("product_id", product.id),
      supabase
        .from("product_images")
        .select("id, color_id, variant_id, storage_path, alt_text, image_type, sort_order")
        .eq("product_id", product.id)
        .order("sort_order"),
      supabase.rpc("get_active_variant_stock", { p_product_id: product.id }),
    ]);

  const stockByVariant = new Map<string, number | null>(
    (stockRows ?? []).map((row: { variant_id: string; available_stock: number | null }) => [
      row.variant_id,
      row.available_stock,
    ]),
  );

  const publicUrl = getProductImagePublicUrlBase();

  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    careInfo: product.care_info,
    basePriceSatang: product.base_price_satang,
    isPreorder: product.is_preorder ?? false,
    colors: (colors ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      hexCode: c.hex_code,
      sortOrder: c.sort_order,
    })),
    sizes: (sizes ?? []).map((s) => ({ id: s.id, name: s.name, sortOrder: s.sort_order })),
    variants: (variants ?? []).map((v) => ({
      id: v.id,
      colorId: v.color_id,
      sizeId: v.size_id,
      sku: v.sku,
      priceSatangOverride: v.price_satang_override,
      isActive: v.is_active,
      availableStock: stockByVariant.get(v.id) ?? null,
    })),
    images: (images ?? []).map((img) => ({
      id: img.id,
      colorId: img.color_id,
      variantId: img.variant_id,
      url: `${publicUrl}/${img.storage_path}`,
      altText: img.alt_text,
      imageType: img.image_type,
      sortOrder: img.sort_order,
    })),
  };
}

function getProductImagePublicUrlBase(): string {
  const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
  return `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images`;
}
