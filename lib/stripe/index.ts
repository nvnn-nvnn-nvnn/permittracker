import "server-only";

/**
 * Billing adapter (Stripe in Phase 5). Plan catalog lives here so limits
 * (truck/item counts) can be enforced by tRPC middleware before Stripe is
 * wired. Prices are placeholders until real Stripe price IDs exist.
 */
import type { PlanTier } from "@/lib/db/schema";

export interface PlanDefinition {
  tier: PlanTier;
  label: string;
  monthlyUsd: number;
  yearlyUsd: number;
  maxTrucks: number;
  maxItems: number | null; // null = unlimited
  sms: boolean;
  voiceEscalation: boolean;
  // Operations pillar (Square sync, P&L, inventory, recipes, purchasing,
  // expenses, item/menu analytics). Pro and up. See 00-decisions.md.
  operations: boolean;
}

export const PLANS: Record<PlanTier, PlanDefinition> = {
  starter: {
    tier: "starter",
    label: "Starter",
    monthlyUsd: 19,
    yearlyUsd: 190,
    maxTrucks: 1,
    maxItems: 15,
    sms: false,
    voiceEscalation: false,
    operations: false,
  },
  pro: {
    tier: "pro",
    label: "Pro",
    monthlyUsd: 49,
    yearlyUsd: 490,
    maxTrucks: 3,
    maxItems: null,
    sms: true,
    voiceEscalation: true,
    operations: true,
  },
  fleet: {
    tier: "fleet",
    label: "Fleet",
    monthlyUsd: 129,
    yearlyUsd: 1290,
    maxTrucks: 10,
    maxItems: null,
    sms: true,
    voiceEscalation: true,
    operations: true,
  },
};

export const CONCIERGE_ONBOARDING_USD = 49;

/**
 * Free-trial length. Card-required trial via Stripe Checkout
 * `trial_period_days` (no free tier — see 00-decisions.md 2026-06-25). Offered
 * once per account; eligibility is gated on `account.trial_started_at`.
 */
export const TRIAL_PERIOD_DAYS = 14;

export type BillingInterval = "month" | "year";
export const PAID_TIERS = ["starter", "pro", "fleet"] as const;

/**
 * Stable price `lookup_key`s. We resolve Stripe price IDs by these at
 * runtime instead of storing IDs in env — so re-running stripe:setup, or a
 * fresh Stripe account, "just works" with no config edits.
 */
export function priceLookupKey(
  tier: PlanTier,
  interval: BillingInterval,
): string {
  return `permitkeep_${tier}_${interval}`;
}
export const CONCIERGE_LOOKUP_KEY = "permitkeep_concierge_onetime";

/** Reverse map (webhook): a subscription price's lookup_key → our tier. */
export function tierFromLookupKey(key: string | null | undefined): PlanTier | null {
  if (!key) return null;
  for (const tier of PAID_TIERS) {
    if (key === `permitkeep_${tier}_month` || key === `permitkeep_${tier}_year`)
      return tier;
  }
  return null;
}

export function priceUsd(tier: PlanTier, interval: BillingInterval): number {
  return interval === "month"
    ? PLANS[tier].monthlyUsd
    : PLANS[tier].yearlyUsd;
}
