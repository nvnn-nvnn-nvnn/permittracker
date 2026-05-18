# Phase 5 — Explained (teaching walkthrough)

Payments. Turn the app into a business: Stripe Checkout to subscribe,
Customer Portal to self-serve, a webhook that is the source of truth for
plan tier, plan limits enforced at the tRPC layer, and a $49 concierge
add-on. Built **live but resilient** — limits work before Stripe exists;
billing actions degrade with a clear message until keys are added.

---

## The flow

```
Settings → Billing (BillingPanel)
  → billing.createCheckout(tier, interval)  → Stripe Checkout (hosted) → pay
        Stripe → webhook /api/webhooks/stripe (signed)
                   → applySubscription(accountId, sub)  ← source of truth
        (dev, no webhook) → "Sync from Stripe" → same applySubscription
  → billing.createPortal       → Stripe Customer Portal (change/cancel)
  → billing.createConciergeCheckout → one-time $49 → webhook sets flag

truck.create / item.create  → limitedProcedure(kind)
  → assertWithinLimit(accountId, kind)  → FORBIDDEN if over plan
```

---

## 1. Prices by `lookup_key`, not stored IDs

The classic Stripe-integration pain: hard-coding price IDs that differ per
environment/account. We avoid it entirely.

- `npm run stripe:setup` (`scripts/stripe-setup.mjs`) creates the
  products/prices **idempotently** — products matched by
  `metadata.tag`, prices by **`lookup_key`** (`permitkeep_pro_month`, …). Run
  it as many times as you like; it only creates what's missing.
- At runtime, `resolvePriceId("permitkeep_pro_month")`
  (`lib/stripe/prices.ts`) asks Stripe for the price with that lookup key and
  caches it in-process. **Zero price IDs in env or code.** A fresh Stripe
  account just needs `stripe:setup` re-run.
- The reverse map `tierFromLookupKey()` lets the webhook turn a subscription's
  price back into our `plan_tier`. The lookup key is the stable contract in
  both directions.

## 2. The webhook is the source of truth

`app/api/webhooks/stripe/route.ts`. Rules that matter:

- **Raw body + signature check.** Stripe signs each event; we
  `constructEvent(rawBody, sig, WEBHOOK_SECRET)`. `export const runtime =
  "nodejs"` and `await req.text()` (no JSON parsing) so the bytes are
  verbatim — a parsed/re-serialized body would fail the signature.
- **Never trust the client for plan state.** The UI never sets the tier; only
  Stripe events do (via `applySubscription`). The browser's "I subscribed"
  is irrelevant — the webhook is authoritative. Same principle as
  "account_id from session, never input", applied to money.
- **One reconciler, two callers.** `applySubscription()` /
  `clearSubscription()` in `lib/stripe/sync.ts` are called by *both* the
  webhook and the manual `syncFromStripe` — they can't drift.
- **Errors → 500 on purpose.** A handler failure returns 500 so Stripe
  *retries* (its built-in durability). Swallowing to 200 would silently lose
  a plan change.
- `resolveAccountId`: prefer `metadata.accountId` (we stamp it on
  checkout/subscription), else look up by `stripe_customer_id`.

## 3. Cron-free dev: the "Sync from Stripe" fallback

Stripe can't POST to `localhost`. Two paths (your earlier choice):

- Real: `stripe listen --forward-to localhost:3000/api/webhooks/stripe`.
- Fallback: `billing.syncFromStripe` pulls the customer's current
  subscription and runs the *same* `applySubscription`. The BillingPanel also
  auto-calls it on return from Checkout (`?billing=success`) so the demo
  works even with no CLI running. (Same "real + manual fallback" pattern as
  Inngest/OCR.)

## 4. Limits enforced at the tRPC layer

Brief: "Enforce limits at the tRPC layer using an `enforceLimits`
middleware." Implementation:

- `limitedProcedure(kind)` in `lib/trpc/trpc.ts` = `protectedProcedure` +
  a middleware that runs `assertWithinLimit()` **before the handler**.
- `truck.create` = `limitedProcedure("truck")`, `item.create` =
  `limitedProcedure("item")`. The check is structurally impossible to skip —
  it's part of the procedure, not a call the handler might forget.
- `assertWithinLimit` (`lib/limits.ts`) counts **non-archived** rows vs the
  plan cap and throws `FORBIDDEN` with an upgrade message. Archiving frees
  capacity (consistent with "archive, don't delete").
- **`effectiveTier`** is the key correctness rule: a `canceled`/`none`
  account doesn't keep Pro limits — it falls to the **Starter floor**. You
  can't cancel and keep the bigger caps. Limits therefore work *before
  Stripe is wired at all* (default `plan_status = none` → starter caps).

## 5. Resilient when unconfigured

`isStripeConfigured()` gates billing actions. No key →
`createCheckout/portal/...` throw a friendly `PRECONDITION_FAILED`; the
BillingPanel shows "billing isn't configured" but still renders the plan and
**limits still enforce**. Nothing crashes pre-Stripe — same adapter
philosophy that paid off with Resend.

---

## Files that matter

- `lib/stripe/client.ts` — lazy SDK + `isStripeConfigured`.
- `lib/stripe/index.ts` — PLANS catalog, lookup-key helpers, tier mapping.
- `lib/stripe/prices.ts` — `lookup_key` → price id (cached).
- `lib/stripe/sync.ts` — `getOrCreateCustomer` / `applySubscription` /
  `clearSubscription` (the one reconciler).
- `scripts/stripe-setup.mjs` — idempotent products/prices (`npm run
  stripe:setup`).
- `lib/trpc/routers/billing.ts` — checkout / concierge / portal / sync.
- `app/api/webhooks/stripe/route.ts` — signed webhook, source of truth.
- `lib/limits.ts` + `lib/trpc/trpc.ts` (`limitedProcedure`) — enforcement.
- `components/features/billing-panel.tsx` — Settings → Billing UI.
- `supabase/migrations/0008_*` — account billing columns + `plan_status`.

## How to demo Phase 5

1. Add `STRIPE_SECRET_KEY` (test mode) to `.env.local`; restart dev.
2. `npm run stripe:setup` → creates the products/prices in your Stripe test
   account.
3. (Real webhooks) `stripe listen --forward-to
   localhost:3000/api/webhooks/stripe` and put the printed signing secret in
   `STRIPE_WEBHOOK_SECRET`. Or skip and use "Sync from Stripe".
4. Settings → Billing → choose **Pro** → Stripe Checkout (test card
   `4242 4242 4242 4242`) → back to Settings → plan shows **pro · active**.
5. Try to add a 4th truck on Pro (limit 3) → blocked with an upgrade
   message. Downgrade/cancel via **Manage billing** → limits drop to
   Starter.
6. **Add concierge onboarding ($49)** → one-time Checkout → "Concierge
   onboarding purchased" appears.
