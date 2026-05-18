# Playbook — Stripe billing from first principles

Goal: after reading this you can rebuild subscription billing **from
memory**, for any app, because you understand the *concepts* — not because
you memorized our code. Provider-conceptual first; PermitKeep files cited as
the concrete instantiation.

(Sits beside code note 07, which is the line-by-line. This one is the model
in your head.)

---

## 1. The one idea everything hangs on

> **Stripe owns the truth about money. Your database is a cache of it. A
> webhook keeps that cache honest.**

If you internalize only one sentence, this is it. You never *decide* someone
is on Pro — Stripe does, and tells you. Your `plan_tier` column is a
denormalized copy you keep for fast reads and limit checks. Every design
rule below falls out of this sentence.

---

## 2. The seven nouns (the whole vocabulary)

You can model Stripe billing with exactly these:

1. **Product** — a thing you sell ("PermitKeep Pro"). Just a name/metadata.
2. **Price** — a specific cost for a Product ("$49/month", "$490/year").
   A Product has many Prices. Prices are immutable; you make new ones.
3. **Customer** — Stripe's record of *your user/account* (one per tenant).
   You store its id (`stripe_customer_id`) on your account.
4. **Checkout Session** — a hosted, PCI-compliant payment page Stripe hosts.
   You create it server-side, redirect the user to it, Stripe does the card
   collection, then redirects back.
5. **Subscription** — the ongoing relationship: this Customer pays this
   Price on a recurring interval. Has a **status** (`active`, `past_due`,
   `canceled`, …) and a current period end.
6. **Webhook event** — Stripe POSTs you JSON when anything happens
   ("subscription updated", "payment failed"). This is how the truth reaches
   you.
7. **Customer Portal** — a hosted page where the user upgrades/cancels
   without you building billing UI. You just create a portal session and
   redirect.

That's it. SMS, taxes, invoices, proration — all exist, but the skeleton is
these seven.

---

## 3. The canonical flow (redraw this from memory)

```
SUBSCRIBE
  app: create Checkout Session (mode=subscription, a Price, the Customer,
       success/cancel URLs, metadata={accountId})
  → redirect user to session.url  (Stripe's page)
  → user pays on Stripe
  → Stripe redirects back to success_url
  → Stripe ALSO fires webhooks: checkout.session.completed,
       customer.subscription.created
  app webhook: verify signature → read subscription → write our DB
       (plan_tier, status, period_end)

CHANGE / CANCEL
  app: create Billing Portal session → redirect
  → user changes plan / cancels on Stripe's page
  → Stripe fires customer.subscription.updated / .deleted
  app webhook: reconcile our DB again

ENFORCE
  every limited action reads OUR cached plan_tier (fast, no Stripe call)
```

The redirect-back and the webhook are **two independent signals**. The
redirect is just UX ("welcome back"); the **webhook is the truth**. Never
mark someone paid because they returned to `success_url` — only because the
webhook said so. (We *also* auto-call a manual sync on return purely so dev
without the CLI still reconciles — convenience, not authority.)

---

## 4. The four hard rules (all derive from §1)

1. **The webhook is the only writer of plan state.** UI/return-URL never set
   `plan_tier`. One function reconciles (`applySubscription`); the webhook
   and the manual sync both call it so they can't disagree.
2. **Verify the webhook signature on the raw body.** The endpoint is public;
   anyone can POST fake "you're on Fleet" events. Stripe signs each request;
   you recompute the HMAC over the *exact bytes* with your
   `STRIPE_WEBHOOK_SECRET`. → Node runtime, read the raw body, no JSON
   middleware before verification. (Same trust model as our signed
   acknowledge tokens, code note 05 — verify, then trust.)
3. **Handlers must be convergent + idempotent.** Stripe may deliver an event
   zero, one, or many times, out of order. So don't *increment* — **set**
   state from the event's current truth ("this subscription is now active on
   price X"). Re-delivering the same event then changes nothing. Safe to
   replay = correct.
4. **Fail loud: return 500 on handler error.** Stripe retries failed
   webhooks with backoff for ~3 days. A `try/catch → 200` permanently loses
   a plan change if your DB blips. Letting it 500 turns Stripe's retry queue
   into your durability layer — for free.

---

## 5. The `lookup_key` trick (the thing people get wrong)

A Price id (`price_1Q…`) is **different in every Stripe account and between
test/live mode**. Hard-coding ids in env means every environment needs
hand-editing and a fresh account breaks you.

Fix: give each Price a stable **`lookup_key`** *you* choose
(`permitkeep_pro_month`). A setup script creates products/prices
idempotently and stamps the keys. At runtime you resolve key → id (and
cache). Going the other way, the webhook reads the subscription's price
`lookup_key` and maps it back to your tier. **The key is the contract; the
id is an implementation detail you never store.** This single decision
removes a whole category of "works on my machine" billing bugs.

---

## 6. Local development reality

Stripe cannot POST to `localhost`. Two ways to receive events:

- `stripe listen --forward-to localhost:3000/api/webhooks/stripe` (the CLI
  prints a signing secret you put in env). This is the real path.
- A **manual "Sync from Stripe"**: fetch the customer's current
  subscription via the API and run the *same* reconciler. Lets you demo
  with no CLI. (General pattern: anything event-driven gets a pull-based
  fallback for dev — same as our Inngest/OCR "run now".)

Production: a real HTTPS endpoint registered in the Stripe dashboard with
its own webhook secret.

---

## 7. Enforcement: read the cache, don't call Stripe

Limit checks (can they add another truck?) must be **fast** and offline —
they read your cached `plan_tier`, never call Stripe. Two subtleties:

- **Effective tier:** a `canceled`/never-subscribed account must fall to
  your *floor* plan, not keep its old caps. Compute
  `effectiveTier(tier, status)` everywhere limits are read; checking raw
  `plan_tier` is the classic "kept Pro after cancelling" bug.
- Enforce it as **middleware on the procedure**, not a call the handler
  might forget (code note 01/07). Structurally un-skippable > disciplined.

---

## 8. Rebuild-from-scratch checklist (the order matters)

1. Add billing columns to your tenant/account row: `stripe_customer_id`,
   `stripe_subscription_id`, `plan_status`, `plan_tier`, `period_end`.
2. Lazy Stripe client (`new Stripe(secret)`), gated by "is configured" so
   the app runs before keys exist.
3. Idempotent setup script: create Products + Prices with stable
   `lookup_key`s. Re-runnable.
4. Runtime price resolver: `lookup_key` → id (cached). Reverse map id/key →
   tier.
5. `getOrCreateCustomer(account)` — make a Stripe Customer once, persist its
   id, stamp `metadata.accountId`.
6. `createCheckoutSession` — subscription mode, the resolved Price, the
   Customer, success/cancel URLs, `metadata.accountId`.
7. **One reconciler** `applySubscription(accountId, sub)` — map Stripe
   status→your enum, price→tier, write the row. `clearSubscription` for
   deleted.
8. Webhook route: raw body + signature verify → switch on event type →
   resolve accountId (metadata first, customer-id fallback) → call the
   reconciler → 500 on error.
9. Customer Portal session endpoint (cancel/upgrade UI for free).
10. Limit middleware reading effective tier from the cached row.
11. Dev: Stripe CLI listener + a manual sync fallback.

Do them in this order and each step only depends on earlier ones.

---

## 9. Mistakes you will otherwise make once

- Trusting `success_url` as proof of payment. (Only the webhook is truth.)
- `JSON`-parsing the webhook body before signature check → every event 400s.
- Catching webhook errors and returning 200 → silent lost upgrades.
- Hard-coding price ids → breaks across envs/accounts. Use `lookup_key`.
- Incremental webhook handlers (`credits += 1`) → double-delivery corrupts.
  Be convergent.
- Reading `plan_tier` directly for limits → cancelled users keep paid caps.
- Building your own card form → don't; Checkout/Portal are hosted + PCI.
- One Customer per *user* instead of per *account/tenant* → billing splits
  across teammates.

---

## 10. PermitKeep file map (concept → where it lives)

| Concept | File |
|---|---|
| Lazy client / "configured?" | `lib/stripe/client.ts` |
| Catalog, lookup-key helpers, tier map | `lib/stripe/index.ts` |
| key → price id (cached) | `lib/stripe/prices.ts` |
| Customer + the one reconciler | `lib/stripe/sync.ts` |
| Idempotent products/prices | `scripts/stripe-setup.mjs` |
| Checkout / Portal / sync endpoints | `lib/trpc/routers/billing.ts` |
| Signed webhook = source of truth | `app/api/webhooks/stripe/route.ts` |
| Effective-tier limit enforcement | `lib/limits.ts` + `lib/trpc/trpc.ts` |
| Billing UI | `components/features/billing-panel.tsx` |

Read this playbook for the model; open code note 07 for the lines; open
these files for the real thing. You should now be able to whiteboard the
whole system without notes.
