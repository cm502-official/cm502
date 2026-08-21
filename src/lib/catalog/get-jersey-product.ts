import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/public";
import { getPublicEnv } from "@/lib/env";
import type { JerseyProduct } from "./types";

/**
 * The one loader the storefront needs for Phase 2: everything to render
 * /products/jersey and drive variant selection, in a single structured
 * object. Uses the public anon client (no cookies — see
 * src/lib/supabase/public.ts) — every table it reads is public-read for
 * active rows (see 0002_rls.sql), so this works identically for
 * anonymous visitors with no special auth, and is safe to wrap in
 * unstable_cache below.
 *
 * Perf: this used to be a fully-dynamic, uncached, per-request fetch —
 * measured at ~0.9-2s server time alone (product row ~500ms mostly
 * connection setup, then a 5-way Promise.all batch ~400ms), which is
 * why "SHOP NOW" felt slow. Catalog data changes rarely, so it's cached
 * for JERSEY_PRODUCT_REVALIDATE_SECONDS — after the cache is warm,
 * requests skip Supabase entirely.
 *
 * Returns null if the product doesn't exist / isn't published, or if
 * Supabase isn't reachable (no live project connected yet, network
 * failure, etc.) — callers render the appropriate empty/error state and
 * never see a raw Postgres/Supabase error. A failed attempt is never
 * cached (see the try/catch placement below) so a transient outage
 * doesn't stick around as a false "Coming soon" for the whole
 * revalidation window.
 */
const JERSEY_PRODUCT_REVALIDATE_SECONDS = 60;
export const JERSEY_PRODUCT_CACHE_TAG = "jersey-product";

const getCachedJerseyProduct = unstable_cache(loadJerseyProduct, ["jersey-product-v2"], {
  revalidate: JERSEY_PRODUCT_REVALIDATE_SECONDS,
  tags: [JERSEY_PRODUCT_CACHE_TAG],
});

export async function getJerseyProduct(): Promise<JerseyProduct | null> {
  try {
    return await getCachedJerseyProduct();
  } catch {
    return null;
  }
}

async function loadJerseyProduct(): Promise<JerseyProduct | null> {
  const supabase = createPublicClient();

  // Wave 1: the product row and the two color/size reference tables are
  // independent of each other (colors/sizes don't depend on product.id)
  // — fire all three together instead of appending colors/sizes to the
  // second wave, so the product-dependent queries below only wait on
  // one round trip's worth of latency, not two.
  const [{ data: product, error: productError }, { data: colors }, { data: sizes }] = await Promise.all([
    supabase
      .from("products")
      .select("id, slug, name, description, care_info, base_price_satang, is_preorder")
      .eq("slug", "jersey")
      .eq("is_active", true)
      .maybeSingle(),
    supabase.from("colors").select("id, name, hex_code, sort_order").order("sort_order"),
    supabase.from("sizes").select("id, name, sort_order").order("sort_order"),
  ]);

  if (productError || !product) return null;

  // Wave 2: these three genuinely depend on product.id, so they can't
  // join wave 1 — but they're independent of each other.
  const [{ data: variants }, { data: images }, { data: stockRows }] = await Promise.all([
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
      url: buildProductImageUrl(publicUrl, img.storage_path),
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

// Catalog images are re-uploaded to Storage under the *same* storage_path
// (e.g. cm502-jersey/navy/primary.jpg gets overwritten in place when a
// color photo is replaced) — product_images has no updated_at/version
// column to derive a cache-busting value from automatically. Without a
// query string, the URL never changes when only the file's bytes do, so
// the browser cache, Vercel's Next/Image optimizer cache, and the
// Supabase Storage CDN can all keep serving the previous photo under the
// old cache key indefinitely.
//
// Fix: append a manual version tag to every catalog image URL. Bump
// CATALOG_IMAGE_ASSET_VERSION whenever an existing storage_path is
// overwritten with new image bytes (not needed for genuinely new paths)
// — that changes the URL, which is a guaranteed cache miss at every layer
// without disabling caching anywhere.
const CATALOG_IMAGE_ASSET_VERSION = "20260817-navy-2";

function buildProductImageUrl(publicUrlBase: string, storagePath: string): string {
  return `${publicUrlBase}/${storagePath}?v=${CATALOG_IMAGE_ASSET_VERSION}`;
}
