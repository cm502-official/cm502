import { getJerseyProduct } from "@/lib/catalog/get-jersey-product";
import { CartPageClient } from "@/components/cart/cart-page-client";

export default async function CartPage() {
  // Needed so "แก้ไขรายละเอียดเสื้อ" can re-resolve an edited shirt to a
  // real variant (§18) — a null product just means edit degrades
  // gracefully (still shown, still removable, editing disabled) rather
  // than crashing the cart page.
  const product = await getJerseyProduct();
  return <CartPageClient product={product} />;
}
