import type { PaymentSettings } from "@/lib/payments/get-payment-settings";
import { formatSatangAsThb } from "@/lib/money";

export function PaymentInstructions({
  settings,
  totalSatang,
}: {
  settings: PaymentSettings;
  totalSatang: number;
}) {
  return (
    <div className="flex flex-col gap-4 border border-line p-5">
      <div className="flex items-baseline justify-between">
        <span className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">
          Amount due
        </span>
        <span className="text-xl font-semibold tabular-nums">{formatSatangAsThb(totalSatang)}</span>
      </div>

      {settings.bankTransfer && (
        <div className="border-t border-line pt-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">Bank Transfer</p>
          <dl className="mt-2 flex flex-col gap-1">
            <Row label="Bank" value={settings.bankTransfer.bankName} />
            <Row label="Account name" value={settings.bankTransfer.accountName} />
            <Row label="Account number" value={settings.bankTransfer.accountNumber} />
          </dl>
        </div>
      )}

      {settings.promptPay && (
        <div className="border-t border-line pt-4 text-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.15em] text-foreground/60">PromptPay</p>
          <dl className="mt-2 flex flex-col gap-1">
            <Row label="PromptPay ID" value={settings.promptPay.promptPayId} />
          </dl>
          {settings.promptPay.qrImageUrl && (
            <div className="relative mt-3 aspect-square w-40 self-center border border-line">
              {/* eslint-disable-next-line @next/next/no-img-element -- admin-configured QR, not part of the Next image pipeline */}
              <img
                src={settings.promptPay.qrImageUrl}
                alt="PromptPay QR code"
                className="h-full w-full object-contain"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-foreground/60">{label}</dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
