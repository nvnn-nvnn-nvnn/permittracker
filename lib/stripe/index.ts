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
  },
};

export const CONCIERGE_ONBOARDING_USD = 49;
