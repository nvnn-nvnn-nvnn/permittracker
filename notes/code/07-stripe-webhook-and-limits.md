# Code 07 — Stripe webhook, lookup-keys & the limits middleware

Goal: read the code that makes billing trustworthy — a signature-verified
webhook as the single source of truth, prices resolved by stable keys, and
plan limits enforced as tRPC middleware that can't be skipped.

Prereq: code notes 01 (procedures/middleware) and 02 (DB).

---

## 1. The shape (pattern: external system → verified webhook → reconcile)

You never trust the browser for money. The pattern:

```
client starts Checkout  →  user pays on STRIPE'S page
Stripe → POST /api/webhooks/stripe  (signed)
   verify signature → translate event → reconcile our DB
the UI only ever *reads* plan state; it never sets it
```

Plus two supporting patterns: **lookup-keys** (reference prices by meaning,
not brittle IDs) and **middleware enforcement** (a rule attached to a
procedure so a handler can't forget it).

---

## 2. Lookup-keys — `lib/stripe/index.ts` + `prices.ts`

```ts
export function priceLookupKey(tier, interval) {       // forward
  return `permitkeep_${tier}_${interval}`;
}
export function tierFromLookupKey(key) {               // reverse (webhook)
  for (const t of PAID_TIERS)
    if (key === `permitkeep_${t}_month` || key === `permitkeep_${t}_year`) return t;
  return null;
}
```

```ts
// prices.ts — resolve an ID from a key, once, then cache
const cache = new Map<string,string>();
export async function resolvePriceId(lookupKey) {
  if (cache.has(lookupKey)) return cache.get(lookupKey)!;
  const res = await getStripe().prices.list({ lookup_keys:[lookupKey], active:true, limit:1 });
  if (!res.data[0]) throw new Error(`No price for "${lookupKey}". Run stripe:setup.`);
  cache.set(lookupKey, res.data[0].id);
  return res.data[0].id;
}
```

Why: a Stripe price ID (`price_1Q…`) is different in every account/mode.
Hard-coding it in env is the classic footgun. A **lookup_key** is a stable
name *we* choose; `scripts/stripe-setup.mjs` stamps it on the price
idempotently, and we resolve ID↔meaning at runtime. `tierFromLookupKey` is
the same idea backwards, so the webhook can turn a paid price back into our
`plan_tier`. The name is the contract; IDs stay an implementation detail.

---

## 3. The webhook — `app/api/webhooks/stripe/route.ts`

```ts
export const runtime = "nodejs";          // need raw bytes, not edge

export async function POST(req: Request) {
  const sig = req.headers.get("stripe-signature");
  const raw = await req.text();           // RAW body — do not JSON.parse
  let event: Stripe.Event;
  try {
    event = getStripe().webhooks.constructEvent(raw, sig, WEBHOOK_SECRET);
  } catch (err) {
    return new Response("…signature failed…", { status: 400 });
  }
  …
}
```

- **`req.text()` + `runtime="nodejs"`** — the signature is an HMAC of the
  *exact* bytes Stripe sent. Next's body parsing or the edge runtime would
  alter them and every event would 400. (Compare code note 05: same
  "verify a signature before trusting input" idea, here from Stripe.)
- **`constructEvent`** throws unless the signature matches
  `STRIPE_WEBHOOK_SECRET`. Anyone can POST to this public URL; only Stripe
  can produce a valid signature. That check *is* the auth.

```ts
switch (event.type) {
  case "checkout.session.completed": {
    const s = event.data.object as Stripe.Checkout.Session;
    const accountId = await resolveAccountId(
      s.metadata?.accountId ?? s.client_reference_id ?? undefined,
      typeof s.customer === "string" ? s.customer : null);
    if (s.mode === "subscription" && s.subscription) {
      const sub = await getStripe().subscriptions.retrieve(<id>);
      await applySubscription(accountId, sub);
    } else if (s.mode === "payment" && s.metadata?.kind === "concierge") {
      …set conciergePurchasedAt…
    }
  }
  case "customer.subscription.updated": …applySubscription…
  case "customer.subscription.deleted": …clearSubscription…
}
```

- `as Stripe.Checkout.Session` — `event.data.object` is a big union; once
  you've branched on `event.type` you know the concrete type, so the cast is
  safe and *documented by the switch* (an allowed, justified cast).
- `resolveAccountId`: trust **our** stamped `metadata.accountId` first; fall
  back to looking up the account by `stripe_customer_id`. Never derive it
  from anything the buyer could forge.
- All DB effects go through `applySubscription`/`clearSubscription` (next
  section) — the handler itself contains no ad-hoc UPDATEs except the
  concierge flag.

```ts
} catch (err) {
  return new Response(`Handler error: ${m}`, { status: 500 });  // ← deliberate
}
return new Response(null, { status: 200 });
```

- **Return 500 on failure, not 200.** Stripe retries failed webhooks with
  backoff. A "log and 200" would *permanently* lose a plan upgrade if our DB
  hiccuped. Letting it 500 turns Stripe's retry queue into our safety net.

---

## 4. One reconciler — `lib/stripe/sync.ts`

```ts
export async function applySubscription(accountId, sub: Stripe.Subscription) {
  const price = sub.items.data[0]?.price;
  const tier  = tierFromLookupKey(price?.lookup_key);
  const status = mapStatus(sub.status);          // Stripe status → our enum
  await getDb().update(account).set({
    stripeSubscriptionId: sub.id, planStatus: status,
    ...(tier ? { planTier: tier } : {}),         // keep last tier if unknown price
    planInterval: price?.recurring?.interval ?? null,
    currentPeriodEnd: …,
  }).where(eq(account.id, accountId));
}
```

The webhook **and** the manual `billing.syncFromStripe` both call this. That
is the whole point: two entry paths, one reconciliation function, so dev
(no webhook) and prod (webhook) can never compute plan state differently.
`mapStatus` collapses Stripe's many statuses into our 5-value enum —
translate the external vocabulary into ours at the boundary, once.

---

## 5. Limits as un-skippable middleware

```ts
// lib/trpc/trpc.ts
export function limitedProcedure(kind: "truck" | "item") {
  return protectedProcedure.use(async ({ ctx, next }) => {
    await assertWithinLimit(ctx.account.accountId, kind);   // throws FORBIDDEN
    return next();                                          // only if under cap
  });
}
```

```ts
// routers: the check is part of the procedure, not a call you might forget
create: limitedProcedure("truck").input(truckInput).mutation(…)
create: limitedProcedure("item").input(itemInput).mutation(…)
```

```ts
// lib/limits.ts
export function effectiveTier(tier, status) {
  return status === "active" || status === "trialing" ? tier : "starter";
}
```

- Middleware runs **before** the handler. If `assertWithinLimit` throws, the
  insert never happens. Compare code note 01: `protectedProcedure` injects
  auth the same way — this is the same composition, for billing.
- **`effectiveTier`** is the subtle correctness rule: a cancelled account
  doesn't keep Pro caps — it falls to the Starter floor. It also means
  limits are enforced *before Stripe is wired* (`plan_status` defaults to
  `none` → starter caps). Billing being unconfigured never means
  "unlimited".
- Counts exclude archived rows — archiving frees capacity, consistent with
  "archive, don't hard-delete".

---

## 6. Build it yourself (exercise)

Add a per-plan cap on **uploaded files**:

1. `lib/stripe/index.ts`: add `maxFilesPerItem` to `PlanDefinition` + each
   plan.
2. `lib/limits.ts`: add a `"file"` branch to `assertWithinLimit` counting
   `file_attachment` for the item.
3. `lib/trpc/trpc.ts`: extend `limitedProcedure`'s `kind` union to include
   `"file"`.
4. Apply `limitedProcedure("file")` to `file.createUploadUrl`.
5. `npm run typecheck` — the union change makes the compiler point at every
   spot you must update. That's the type system doing the bookkeeping.

---

## 7. Gotchas

- **Raw body or bust.** Any middleware/parser that touches the webhook body
  before `constructEvent` breaks signature verification. Keep the route
  Node-runtime and read `req.text()` first thing.
- **500 is correct on handler error** — it buys you Stripe's retry. Don't
  "helpfully" catch-and-200.
- **Idempotency:** Stripe may deliver an event more than once. Our handlers
  are write-converging (set state from the subscription), so a repeat is
  harmless — design webhook handlers to be re-runnable, not incremental.
- **`metadata.accountId` is set by us** at checkout/subscription creation —
  that's why the webhook can trust it. Don't read buyer-controlled fields
  for authorization.
- **`effectiveTier` everywhere limits are read.** If you check `planTier`
  directly somewhere you reintroduce the "kept Pro after cancel" bug.
- **Lookup-keys must match** the script and the resolver exactly. A typo =
  "No price for …; run stripe:setup" at runtime, not compile time — one of
  the few stringly-typed seams; keep `priceLookupKey` the single source.
