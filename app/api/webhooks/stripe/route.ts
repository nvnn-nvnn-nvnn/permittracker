import type Stripe from "stripe";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { applySubscription, clearSubscription } from "@/lib/stripe/sync";
import * as Sentry from "@sentry/nextjs";
// Stripe signature verification needs the raw body → Node runtime, no parsing.
export const runtime = "nodejs";

/** accountId from metadata, else resolve by Stripe customer id. */
async function resolveAccountId(
  metadataAccountId: string | undefined,
  customerId: string | null,
): Promise<string | null> {
  if (metadataAccountId) return metadataAccountId;
  if (!customerId) return null;
  const [row] = await getDb()
    .select({ id: account.id })
    .from(account)
    .where(eq(account.stripeCustomerId, customerId))
    .limit(1);
  return row?.id ?? null;
}

export async function POST(req: Request): Promise<Response> {
  if (!isStripeConfigured() || !serverEnv().STRIPE_WEBHOOK_SECRET) {
    return new Response("Billing not configured", { status: 503 });
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return new Response("Missing signature", { status: 400 });

  const raw = await req.text();
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(
      raw,
      sig,
      serverEnv().STRIPE_WEBHOOK_SECRET!,
    );
  } catch (err) {
    const m = err instanceof Error ? err.message : "bad signature";
    return new Response(`Webhook signature verification failed: ${m}`, {
      status: 400,
    });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s = event.data.object as Stripe.Checkout.Session;
        const accountId = await resolveAccountId(
          s.metadata?.accountId ?? s.client_reference_id ?? undefined,
          typeof s.customer === "string" ? s.customer : null,
        );
        if (!accountId) break;

        if (s.mode === "subscription" && s.subscription) {
          const sub = await getStripe().subscriptions.retrieve(
            typeof s.subscription === "string"
              ? s.subscription
              : s.subscription.id,
          );
          await applySubscription(accountId, sub);
        } else if (s.mode === "payment" && s.metadata?.kind === "concierge") {
          await getDb()
            .update(account)
            .set({ conciergePurchasedAt: new Date(), updatedAt: new Date() })
            .where(eq(account.id, accountId));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const sub = event.data.object as Stripe.Subscription;
        const accountId = await resolveAccountId(
          sub.metadata?.accountId,
          typeof sub.customer === "string" ? sub.customer : null,
        );
        if (accountId) await applySubscription(accountId, sub);
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object as Stripe.Subscription;
        const accountId = await resolveAccountId(
          sub.metadata?.accountId,
          typeof sub.customer === "string" ? sub.customer : null,
        );
        if (accountId) await clearSubscription(accountId);
        break;
      }
      default:
        // Unhandled event types are acknowledged (200) and ignored.
        break;
    }
  } catch (err) {
    // Log-and-200 would hide failures; 500 makes Stripe retry.
    const m = err instanceof Error ? err.message : "handler error";
    Sentry.captureException(err, {tags: {type: "webhook_5xx", webhook: "stripe"}});
    return new Response(`Handler error: ${m}`, { status: 500 });
  }

  return new Response(null, { status: 200 });
}
