/**
 * Receiver validation (§11) — compares OCR-extracted receiver details
 * against CM502's configured payment destination. Deliberately lenient:
 * Thai bank slips format names/accounts inconsistently (spacing, masked
 * digits, honorifics), and being too strict would reject genuine payments.
 */
export interface ConfiguredReceiver {
  bankName?: string | null;
  accountName?: string | null;
  accountNumber?: string | null;
  promptPayId?: string | null;
}

export interface DetectedReceiver {
  bankName?: string | null;
  receiverName?: string | null;
  receiverAccount?: string | null;
}

function normalizeText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function normalizeDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/** Exact-number match, or a masked slip's visible digits matching a suffix of the real number. */
function accountNumbersMatch(configured: string, detected: string): boolean {
  const a = normalizeDigits(configured);
  const b = normalizeDigits(detected);
  if (a.length === 0 || b.length === 0) return false;
  if (a === b) return true;
  const minLen = Math.min(a.length, b.length);
  if (minLen < 4) return false;
  return a.slice(-minLen) === b.slice(-minLen);
}

/**
 * Returns:
 *   - null  → not enough information on either side to compare (missing
 *             config or missing OCR extraction) — not a rejection.
 *   - true  → matches on at least one strong signal (account number or
 *             account name), with nothing that outright conflicts.
 *   - false → a signal that IS present on both sides clearly disagrees.
 */
export function isReceiverMatch(configured: ConfiguredReceiver | null, detected: DetectedReceiver): boolean | null {
  if (!configured) return null;

  const hasConfigured = Boolean(configured.accountName || configured.accountNumber || configured.bankName);
  const hasDetected = Boolean(detected.receiverName || detected.receiverAccount || detected.bankName);
  if (!hasConfigured || !hasDetected) return null;

  let anyStrongMatch = false;
  let anyConflict = false;

  if (configured.accountNumber && detected.receiverAccount) {
    if (accountNumbersMatch(configured.accountNumber, detected.receiverAccount)) {
      anyStrongMatch = true;
    } else {
      anyConflict = true;
    }
  }

  if (configured.accountName && detected.receiverName) {
    if (normalizeText(configured.accountName) === normalizeText(detected.receiverName)) {
      anyStrongMatch = true;
    } else {
      anyConflict = true;
    }
  }

  if (configured.bankName && detected.bankName) {
    if (normalizeText(configured.bankName) !== normalizeText(detected.bankName)) {
      anyConflict = true;
    }
  }

  if (anyConflict) return false;
  if (anyStrongMatch) return true;
  return null;
}
