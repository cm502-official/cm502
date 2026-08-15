"use client";

/**
 * Quantity stepper. Bounds are UX-only — the server re-checks stock and
 * quantity independently at order creation (never trust this for
 * security), but it still shouldn't let a customer dial in something
 * obviously invalid.
 */
export function QuantityInput({
  value,
  max,
  onChange,
  disabled,
}: {
  value: number;
  max: number;
  onChange: (next: number) => void;
  disabled?: boolean;
}) {
  const atMin = value <= 1;
  const atMax = value >= max;

  return (
    <div className="inline-flex items-center border border-line" role="group" aria-label="Quantity">
      <button
        type="button"
        onClick={() => onChange(Math.max(1, value - 1))}
        disabled={disabled || atMin}
        aria-label="Decrease quantity"
        className="flex h-12 w-12 items-center justify-center text-lg disabled:opacity-30"
      >
        −
      </button>
      <span className="flex h-12 min-w-12 items-center justify-center px-2 text-sm font-medium tabular-nums" aria-live="polite">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, value + 1))}
        disabled={disabled || atMax}
        aria-label="Increase quantity"
        className="flex h-12 w-12 items-center justify-center text-lg disabled:opacity-30"
      >
        +
      </button>
    </div>
  );
}
