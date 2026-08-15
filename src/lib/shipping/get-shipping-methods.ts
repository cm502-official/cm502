import "server-only";

import { createClient } from "@/lib/supabase/server";

export interface ShippingMethod {
  id: string;
  name: string;
  description: string | null;
  priceSatang: number;
}

/** Active shipping methods, admin-configured — never hardcoded (§15). */
export async function getShippingMethods(): Promise<ShippingMethod[]> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("shipping_methods")
      .select("id, name, description, price_satang")
      .eq("is_active", true)
      .order("sort_order");

    if (error || !data) return [];

    return data.map((row) => ({
      id: row.id,
      name: row.name,
      description: row.description,
      priceSatang: row.price_satang,
    }));
  } catch {
    // Supabase unreachable/unconfigured — checkout shows "no shipping
    // methods available" rather than crashing the page (§23/§29).
    return [];
  }
}
