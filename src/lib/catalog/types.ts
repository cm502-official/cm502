/**
 * Domain types for the storefront catalog. Hand-written rather than
 * generated because src/lib/supabase/types.ts is still a placeholder
 * (`Database = any`) until a real Supabase project exists — see that
 * file's docstring for the regeneration command. These shapes mirror
 * supabase/migrations/0001_init.sql exactly; keep them in sync if the
 * schema changes.
 */

export interface Color {
  id: string;
  name: string;
  hexCode: string | null;
  sortOrder: number;
}

export interface Size {
  id: string;
  name: string;
  sortOrder: number;
}

export type ProductImageType = "front" | "back" | "detail" | "lifestyle";

export interface ProductImage {
  id: string;
  colorId: string | null;
  variantId: string | null;
  url: string;
  altText: string;
  imageType: ProductImageType;
  sortOrder: number;
}

export interface Variant {
  id: string;
  colorId: string;
  sizeId: string;
  sku: string;
  priceSatangOverride: number | null;
  isActive: boolean;
  /** From get_active_variant_stock(); null if the RPC couldn't be reached. */
  availableStock: number | null;
}

export interface JerseyProduct {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  careInfo: string | null;
  basePriceSatang: number;
  colors: Color[];
  sizes: Size[];
  variants: Variant[];
  images: ProductImage[];
}
