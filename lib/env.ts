import { z } from "zod";


/**
 * Centralized, validated environment access.
 *
 * Server-only secrets are validated lazily via `serverEnv()` so that client
 * bundles and `next build` don't crash when (stubbed) integrations have no keys
 * yet. Public values are read eagerly.
 *
 * Per brief: Supabase + Anthropic are "live"; Stripe/Twilio/Resend/Postmark are
 * stubbed until their phase, so their keys are optional.
 */

const serverSchema = z.object({
  // --- Database (Supabase Postgres) ---
  DATABASE_URL: z.string().url().optional(),

  // --- Supabase ---
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),

  // --- Anthropic (live: OCR pipeline, phase 3) ---
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  ANTHROPIC_MODEL: z.string().min(1).default("claude-sonnet-4-6"),

  // --- Inngest (background jobs). Optional in local dev mode. ---
  INNGEST_EVENT_KEY: z.string().optional(),
  INNGEST_SIGNING_KEY: z.string().optional(),

    // --- Sentry (observability). Optional; no-op when unset. ---
  SENTRY_DSN: z.string().optional(),

  // --- Stubbed integrations (wired in later phases) ---
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  // Sender for outbound email. Resend's shared test sender only delivers to
  // the Resend account owner — fine for dev. Real sending needs a verified
  // domain address here.
  EMAIL_FROM: z.string().min(1).default("PermitKeep <onboarding@resend.dev>"),
  POSTMARK_SERVER_TOKEN: z.string().optional(),
  POSTMARK_INBOUND_SECRET: z.string().optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_FROM_NUMBER: z.string().optional(),

  // --- App ---
  APP_URL: z.string().url().default("http://localhost:3000"),
  REMINDER_TOKEN_SECRET: z.string().min(1).optional(),
  
});

const publicSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z
    .string()
    .url()
    .optional()
    .default("http://localhost:54321"),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().optional().default("anon-placeholder"),
    NEXT_PUBLIC_SENTRY_DSN: z.string().optional(),
});

export const publicEnv = publicSchema.parse({
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN,
});

let _serverEnv: z.infer<typeof serverSchema> | null = null;

/** Lazily validate + memoize server env. Call only in server code. */
export function serverEnv(): z.infer<typeof serverSchema> {
  if (_serverEnv) return _serverEnv;
  _serverEnv = serverSchema.parse(process.env);
  return _serverEnv;
}

/** Throwing accessor for required-at-use-time secrets. */
export function requireEnv<K extends keyof z.infer<typeof serverSchema>>(
  key: K,
): NonNullable<z.infer<typeof serverSchema>[K]> {
  const value = serverEnv()[key];
  if (value === undefined || value === null || value === "") {
    throw new Error(
      `Missing required environment variable: ${String(key)}. ` +
        `See .env.example. (This integration may not be wired yet.)`,
    );
  }
  return value as NonNullable<z.infer<typeof serverSchema>[K]>;
}
