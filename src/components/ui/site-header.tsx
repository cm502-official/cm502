import Link from "next/link";
import { CartIcon } from "@/components/cart/cart-icon";

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-line/80 bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4 sm:px-6">
        <Link
          href="/"
          className="font-display text-2xl tracking-[0.08em] transition-opacity hover:opacity-70"
        >
          CM502
        </Link>

        <nav className="hidden items-center gap-8 text-sm font-medium tracking-wide sm:flex">
          <Link href="/products/jersey" className="transition-opacity hover:opacity-60">
            SHOP
          </Link>
          <Link href="/track-order" className="transition-opacity hover:opacity-60">
            TRACK ORDER
          </Link>
        </nav>

        <CartIcon />
      </div>
    </header>
  );
}
