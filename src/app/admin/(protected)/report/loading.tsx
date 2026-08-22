/** §16 — shown instantly while the report's data fetch/aggregation runs (including every date-filter change, since that's a new navigation). Static, no animation, mirrors the real page's rough shape. */
export default function AdminReportLoading() {
  return (
    <div className="flex flex-col gap-8" aria-hidden>
      <div className="h-8 w-40 bg-paper-dim" />
      <div className="h-9 w-full max-w-md bg-paper-dim" />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="h-20 bg-paper-dim" />
        <div className="h-20 bg-paper-dim" />
        <div className="h-20 bg-paper-dim" />
        <div className="h-20 bg-paper-dim" />
      </div>
      <div className="h-48 bg-paper-dim" />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="h-40 bg-paper-dim" />
        <div className="h-40 bg-paper-dim" />
      </div>
      <span className="sr-only">Loading report…</span>
    </div>
  );
}
