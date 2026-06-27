import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { resolvePriceId } from "@/lib/stripe/prices";
import {
  CONCIERGE_LOOKUP_KEY,
  priceLookupKey,
  TRIAL_PERIOD_DAYS,
} from "@/lib/stripe";
import {
  applySubscription,
  clearSubscription,
  getOrCreateCustomer,
} from "@/lib/stripe/sync";

/** Billing is owner-only. */
function assertOwner(role: string) {
  if (role !== "owner") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Only the account owner can manage billing.",
    });
  }
}
function assertStripe() {
  if (!isStripeConfigured()) {
    throw new TRPCError({
      code: "PRECONDITION_FAILED",
      message:
        "Billing is not configured yet. Add STRIPE_SECRET_KEY to .env.local.",
    });
  }
}

async function loadAccount(accountId: string) {
  const [row] = await getDb()
    .select()
    .from(account)
    .where(eq(account.id, accountId))
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND" });
  return row;
}

/** Eligible for the one-time free trial: never subscribed and never trialed. */
function isTrialEligible(a: {
  planStatus: string;
  trialStartedAt: Date | null;
  stripeSubscriptionId: string | null;
}): boolean {
  return (
    a.planStatus === "none" &&
    a.trialStartedAt === null &&
    !a.stripeSubscriptionId
  );
}

export const billingRouter = createTRPCRouter({
  /** Current billing snapshot for the Settings UI. */
  status: protectedProcedure.query(async ({ ctx }) => {
    const a = await loadAccount(ctx.account.accountId);
    return {
      tier: a.planTier,
      status: a.planStatus,
      interval: a.planInterval,
      currentPeriodEnd: a.currentPeriodEnd,
      conciergePurchasedAt: a.conciergePurchasedAt,
      stripeConfigured: isStripeConfigured(),
      isOwner: ctx.account.role === "owner",
      // Trial: whether starting one is still available, plus its length and
      // (when trialing) the trial end = currentPeriodEnd.
      trialEligible: isTrialEligible(a),
      trialDays: TRIAL_PERIOD_DAYS,
    };
  }),

  /** Stripe Checkout for a subscription plan. */
  createCheckout: protectedProcedure
    .input(
      z.object({
        tier: z.enum(["starter", "pro", "fleet"]),
        interval: z.enum(["month", "year"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      assertOwner(ctx.account.role);
      assertStripe();
      const a = await loadAccount(ctx.account.accountId);
      const customerId = await getOrCreateCustomer(a, ctx.account.email);
      const price = await resolvePriceId(
        priceLookupKey(input.tier, input.interval),
      );
      const appUrl = serverEnv().APP_URL;
      const trialing = isTrialEligible(a);
      const session = await getStripe().checkout.sessions.create({
        mode: "subscription",
        customer: customerId,
        line_items: [{ price, quantity: 1 }],
        client_reference_id: a.id,
        // Card required even during the trial; if the card later fails when the
        // trial ends, Stripe cancels rather than leaving a free dangling sub.
        payment_method_collection: "always",
        subscription_data: {
          metadata: { accountId: a.id },
          ...(trialing
            ? {
                trial_period_days: TRIAL_PERIOD_DAYS,
                trial_settings: {
                  end_behavior: { missing_payment_method: "cancel" },
                },
              }
            : {}),
        },
        success_url: `${appUrl}/settings?billing=success`,
        cancel_url: `${appUrl}/settings?billing=cancel`,
        allow_promotion_codes: true,
      });
      if (!session.url)
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return { url: session.url, trialing };
    }),

  /** One-time $49 concierge onboarding add-on. */
  createConciergeCheckout: protectedProcedure.mutation(async ({ ctx }) => {
    assertOwner(ctx.account.role);
    assertStripe();
    const a = await loadAccount(ctx.account.accountId);
    const customerId = await getOrCreateCustomer(a, ctx.account.email);
    const price = await resolvePriceId(CONCIERGE_LOOKUP_KEY);
    const appUrl = serverEnv().APP_URL;
    const session = await getStripe().checkout.sessions.create({
      mode: "payment",
      customer: customerId,
      line_items: [{ price, quantity: 1 }],
      client_reference_id: a.id,
      payment_intent_data: {
        metadata: { accountId: a.id, kind: "concierge" },
      },
      metadata: { accountId: a.id, kind: "concierge" },
      success_url: `${appUrl}/settings?billing=concierge`,
      cancel_url: `${appUrl}/settings?billing=cancel`,
    });
    if (!session.url) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return { url: session.url };
  }),

  /** Stripe Customer Portal for self-serve plan changes / cancellation. */
  createPortal: protectedProcedure.mutation(async ({ ctx }) => {
    assertOwner(ctx.account.role);
    assertStripe();
    const a = await loadAccount(ctx.account.accountId);
    if (!a.stripeCustomerId) {
      throw new TRPCError({
        code: "PRECONDITION_FAILED",
        message: "No billing account yet — start a plan first.",
      });
    }
    const appUrl = serverEnv().APP_URL;
    const portal = await getStripe().billingPortal.sessions.create({
      customer: a.stripeCustomerId,
      return_url: `${appUrl}/settings`,
    });
    return { url: portal.url };
  }),

  /**
   * Manual fallback: pull the latest subscription state from Stripe and
   * reconcile (for when the webhook / Stripe CLI isn't running in dev).
   */
  syncFromStripe: protectedProcedure.mutation(async ({ ctx }) => {
    assertOwner(ctx.account.role);
    assertStripe();
    const a = await loadAccount(ctx.account.accountId);
    if (!a.stripeCustomerId) return { synced: false as const };

    const subs = await getStripe().subscriptions.list({
      customer: a.stripeCustomerId,
      status: "all",
      limit: 10,
    });
    const active =
      subs.data.find(
        (s) => s.status === "active" || s.status === "trialing",
      ) ?? subs.data[0];

    if (!active) {
      await clearSubscription(a.id);
      return { synced: true as const, status: "canceled" as const };
    }
    await applySubscription(a.id, active);
    return { synced: true as const, status: active.status };
  }),
});
