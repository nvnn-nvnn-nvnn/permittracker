import "server-only";
import Stripe from "stripe";
import { serverEnv } from "@/lib/env";

/** Thrown when billing is used before STRIPE_SECRET_KEY is configured. */
export class StripeNotConfiguredError extends Error {
  constructor() {
    super(
      "Billing is not configured yet (STRIPE_SECRET_KEY missing). Add it to .env.local.",
    );
  }
}

export function isStripeConfigured(): boolean {
  return Boolean(serverEnv().STRIPE_SECRET_KEY);
}

let _stripe: Stripe | null = null;

/** Lazy Stripe client. Throws a typed error if the key isn't set, so the
 *  rest of the app keeps working (limits still enforce) pre-Stripe. */
export function getStripe(): Stripe {
  if (_stripe) return _stripe;
  const key = serverEnv().STRIPE_SECRET_KEY;
  if (!key) throw new StripeNotConfiguredError();
  // No explicit apiVersion — use the version pinned by this SDK release.
  _stripe = new Stripe(key);
  return _stripe;
}
