"use client";

/**
 * Compact per-size quantity stepper — unlike QuantityInput (product-page
 * "how many of the one size I picked"), this allows 0 as a valid resting
 * state, since a size grid row that isn't being ordered should read as
 * "0", not force a minimum of 1.
 */
export function SizeQuantityInput({
  value,
  max,
  onChange,
  label,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  label: string;
}) {
  const atMin = value <= 0;
  const atMax = value >= max;

  return (
    <div className="inline-flex items-center border border-line" role="group" aria-label={`${label} quantity`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(0, value - 1))}
        disabled={atMin}
        aria-label={`Decrease ${label} quantity`}
        className="flex h-9 w-9 items-center justify-center text-base disabled:opacity-30"
      >
        −
      </button>
      <input
        type="text"
        inputMode="numeric"
        value={value}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          const parsed = digits === "" ? 0 : Number.parseInt(digits, 10);
          onChange(Math.max(0, Math.min(max, parsed)));
        }}
        aria-label={`${label} quantity`}
        className="h-9 w-10 border-x border-line bg-transparent text-center text-sm font-medium tabular-nums outline-none"
      />
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={atMax}
        aria-label={`Increase ${label} quantity`}
        className="flex h-9 w-9 items-center justify-center text-base disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
