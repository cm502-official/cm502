/**
 * Centralized, validated access to environment variables.
 *
 * Importing `serverEnv` outside a server context (route handler, Server
 * Component, server action) will throw at build/runtime, because the
 * `server-only` package poisons the module for client bundles.
 */
import { z } from "zod";

const publicEnvSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url({
    message: "NEXT_PUBLIC_SUPABASE_URL is missing or not a valid URL. Copy .env.example to .env.local and fill it in.",
  }),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1, "NEXT_PUBLIC_SUPABASE_ANON_KEY is missing."),
});

// Parsed lazily (not at module load) so the app can still boot with an
// empty .env.local during early scaffolding; callers that actually need
// Supabase get a clear error at the point of use instead of a build crash.
export function getPublicEnv() {
  return publicEnvSchema.parse({
    NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  });
}

const serverEnvSchema = z.object({
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1, "SUPABASE_SERVICE_ROLE_KEY is missing."),
  SUPABASE_STORAGE_SLIPS_BUCKET: z.string().min(1).default("payment-slips"),
  SUPABASE_STORAGE_SHIPPING_PROOFS_BUCKET: z.string().min(1).default("shipping-proofs"),
  OCR_PROVIDER: z.enum(["mock", "external"]).default("mock"),
  OCR_API_KEY: z.string().optional(),
  OCR_API_URL: z.string().optional(),
  SITE_URL: z.string().url().default("http://localhost:3000"),
  STOCK_RESERVATION_TTL_MINUTES: z.coerce.number().int().positive().default(15),
  // Bearer secret the reservation-expiration cron endpoint requires.
  // Optional at the schema level so the app still boots without it, but
  // the endpoint itself treats an unset secret as "reject everything"
  // (fail closed, never fail open) — see src/app/api/cron/expire-reservations/route.ts.
  CRON_SECRET: z.string().min(1).optional(),
});

export function getServerEnv() {
  return serverEnvSchema.parse({
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_SLIPS_BUCKET: process.env.SUPABASE_STORAGE_SLIPS_BUCKET,
    SUPABASE_STORAGE_SHIPPING_PROOFS_BUCKET: process.env.SUPABASE_STORAGE_SHIPPING_PROOFS_BUCKET,
    OCR_PROVIDER: process.env.OCR_PROVIDER,
    OCR_API_KEY: process.env.OCR_API_KEY,
    OCR_API_URL: process.env.OCR_API_URL,
    SITE_URL: process.env.SITE_URL,
    STOCK_RESERVATION_TTL_MINUTES: process.env.STOCK_RESERVATION_TTL_MINUTES,
    CRON_SECRET: process.env.CRON_SECRET,
  });
}
