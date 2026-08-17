import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPublicEnv } from "@/lib/env";

export interface BankTransferConfig {
  bankName: string;
  accountName: string;
  accountNumber: string;
}

export interface PromptPayConfig {
  promptPayId: string;
  qrImageUrl: string | null;
}

export interface PaymentSettings {
  bankTransfer: BankTransferConfig | null;
  promptPay: PromptPayConfig | null;
}

const PLACEHOLDER = "REPLACE_ME";

function isPlaceholder(value: unknown): boolean {
  return typeof value !== "string" || value.trim() === "" || value.trim().toUpperCase() === PLACEHOLDER;
}

/**
 * Reads admin-configured payment destination info from site_settings
 * (public-read table, seeded with REPLACE_ME placeholders per §3). Any
 * field still holding the placeholder is treated as "not configured" —
 * the payment page must never show REPLACE_ME to a customer as if it
 * were real payment instructions. Returns null for a method that isn't
 * fully configured; the page fails closed rather than showing partial junk.
 */
export async function getPaymentSettings(): Promise<PaymentSettings> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("site_settings")
      .select("key, value")
      .in("key", ["payment_bank_transfer", "payment_promptpay"]);

    if (error || !data) return { bankTransfer: null, promptPay: null };

    const bankRow = data.find((r) => r.key === "payment_bank_transfer")?.value as
      | { bank_name?: unknown; account_name?: unknown; account_number?: unknown }
      | undefined;
    const promptPayRow = data.find((r) => r.key === "payment_promptpay")?.value as
      | { promptpay_id?: unknown; qr_image_storage_path?: unknown }
      | undefined;

    let bankTransfer: BankTransferConfig | null = null;
    if (
      bankRow &&
      !isPlaceholder(bankRow.bank_name) &&
      !isPlaceholder(bankRow.account_name) &&
      !isPlaceholder(bankRow.account_number)
    ) {
      bankTransfer = {
        bankName: bankRow.bank_name as string,
        accountName: bankRow.account_name as string,
        accountNumber: bankRow.account_number as string,
      };
    }

    let promptPay: PromptPayConfig | null = null;
    if (promptPayRow && !isPlaceholder(promptPayRow.promptpay_id)) {
      const qrPath =
        typeof promptPayRow.qr_image_storage_path === "string" ? promptPayRow.qr_image_storage_path : null;
      let qrImageUrl: string | null = null;
      if (qrPath) {
        const { NEXT_PUBLIC_SUPABASE_URL } = getPublicEnv();
        qrImageUrl = `${NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/product-images/${qrPath}`;
      }
      promptPay = { promptPayId: promptPayRow.promptpay_id as string, qrImageUrl };
    }

    return { bankTransfer, promptPay };
  } catch {
    // Supabase unreachable/unconfigured — fail closed, same as every
    // other server loader in this codebase (§23/§29 precedent).
    return { bankTransfer: null, promptPay: null };
  }
}
