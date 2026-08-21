import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface AdminCatalogVariant {
  variantId: string;
  colorId: string;
  sizeId: string;
  colorName: string;
  sizeName: string;
}

/**
 * Active color×size variants for the (single) CM502 jersey product —
 * feeds the admin order-edit item editor's color/size selects (§1). Only
 * `is_active` variants are offered, same rule the checkout color picker
 * already applies (getAvailableColors) — Cream's variants were
 * deactivated in migration 0012, so it's naturally excluded here too,
 * without a separate deny-list.
 */
export async function getAdminCatalogVariants(): Promise<AdminCatalogVariant[]> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from("product_variants")
    .select("id, color_id, size_id, is_active, colors ( name, sort_order ), sizes ( name, sort_order ), products!inner ( slug )")
    .eq("is_active", true)
    .eq("products.slug", "jersey")
    .order("sort_order", { referencedTable: "colors" })
    .order("sort_order", { referencedTable: "sizes" });

  if (error || !data) return [];

  return (data as unknown as Array<{
    id: string;
    color_id: string;
    size_id: string;
    colors: { name: string } | null;
    sizes: { name: string } | null;
  }>)
    .filter((row) => row.colors && row.sizes)
    .map((row) => ({
      variantId: row.id,
      colorId: row.color_id,
      sizeId: row.size_id,
      colorName: row.colors!.name,
      sizeName: row.sizes!.name,
    }));
}
