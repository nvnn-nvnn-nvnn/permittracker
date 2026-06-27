import "server-only";
import type Stripe from "stripe";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { account } from "@/lib/db/schema";
import type { Account, PlanStatus, PlanTier } from "@/lib/db/schema";
import { getStripe } from "./client";
import { tierFromLookupKey } from "./index";

/** Map a Stripe subscription.status onto our enum. */
function mapStatus(s: Stripe.Subscription.Status): PlanStatus {
  if (s === "active") return "active";
  if (s === "trialing") return "trialing";
  if (s === "past_due" || s === "unpaid") return "past_due";
  return "canceled"; // canceled, incomplete, incomplete_expired, paused
}

/** Ensure the account has a Stripe customer; create + persist if missing. */
export async function getOrCreateCustomer(
  acc: Pick<Account, "id" | "name" | "stripeCustomerId">,
  ownerEmail: string | null,
): Promise<string> {
  if (acc.stripeCustomerId) return acc.stripeCustomerId;
  const stripe = getStripe();
  const customer = await stripe.customers.create({
    name: acc.name,
    email: ownerEmail ?? undefined,
    metadata: { accountId: acc.id },
  });
  await getDb()
    .update(account)
    .set({ stripeCustomerId: customer.id, updatedAt: new Date() })
    .where(eq(account.id, acc.id));
  return customer.id;
}

/**
 * Reconcile an account's billing columns from a Stripe subscription.
 * Single source of truth used by BOTH the webhook and the manual
 * syncFromStripe fallback, so they can't drift.
 */
export async function applySubscription(
  accountId: string,
  sub: Stripe.Subscription,
): Promise<void> {
  const item = sub.items.data[0];
  const price = item?.price;
  const tier: PlanTier | null = tierFromLookupKey(price?.lookup_key);
  const status = mapStatus(sub.status);
  const interval = price?.recurring?.interval ?? null;
  // `current_period_end` is an epoch-seconds number on the subscription.
  const periodEnd =
    (sub as unknown as { current_period_end?: number })
      .current_period_end ?? null;

  await getDb()
    .update(account)
    .set({
      stripeSubscriptionId: sub.id,
      planStatus: status,
      // Keep the last known tier if Stripe price isn't one of ours.
      ...(tier ? { planTier: tier } : {}),
      planInterval: interval,
      currentPeriodEnd: periodEnd ? new Date(periodEnd * 1000) : null,
      // Stamp the trial start exactly once, the first time we see `trialing`.
      // coalesce keeps the original timestamp on subsequent reconciles.
      ...(status === "trialing"
        ? { trialStartedAt: sql`coalesce(${account.trialStartedAt}, now())` }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(account.id, accountId));
}

/** Subscription ended/deleted → drop to canceled (limits fall to starter). */
export async function clearSubscription(accountId: string): Promise<void> {
  await getDb()
    .update(account)
    .set({
      planStatus: "canceled",
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      updatedAt: new Date(),
    })
    .where(eq(account.id, accountId));
}
