import Link from "next/link";

export default function OrderNotFound() {
  return (
    <section className="mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-24 text-center sm:px-6">
      <h1 className="font-display text-3xl uppercase tracking-wide">Order not found</h1>
      <p className="text-sm text-foreground/60">
        We couldn&apos;t find an order at this link. Double-check the link from your confirmation,
        or track your order another way.
      </p>
      <Link
        href="/track-order"
        className="mt-2 inline-flex h-12 items-center justify-center bg-ink px-8 text-sm font-semibold uppercase tracking-[0.15em] text-paper transition-opacity hover:opacity-80"
      >
        Track an Order
      </Link>
    </section>
  );
}
