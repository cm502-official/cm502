export function SiteFooter() {
  return (
    <footer className="border-t border-line/80">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="font-display text-xl tracking-[0.08em]">CM502</p>
          <p className="text-xs tracking-wide text-foreground/60">
            &copy; {new Date().getFullYear()} CM502. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
