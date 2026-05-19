# Code 09 — Inbound email + multi-channel dispatch (implementation)

Goal: read the code that (a) turns a forwarded email into a draft/proposal
and (b) adds SMS as a second reminder channel — and the simulator trick that
makes both testable without Postmark/Twilio.

Prereq: code notes 04 (Claude tool pattern), 06 (reminder dispatch).

---

## 1. The shape (pattern: webhook = thin shell over a shared core)

```
real webhook  ─┐
               ├─→ processInboundEmail(accountId, email)   ← all the logic
dev simulator ─┘

real webhook  ─┐
               ├─→ acknowledgeBySmsReply(fromPhone, body)  ← all the logic
dev simulator ─┘
```

The webhook handlers do **only** transport concerns (parse the provider's
payload, auth, resolve the account). The actual behaviour lives in a plain
function both the webhook and a tRPC simulator call. This is why "no
Postmark/Twilio in dev" doesn't mean "untested" — the simulator exercises the
exact same core.

## 2. `lib/inbound/process.ts` — store → classify → match-or-draft

```ts
const cls = await classifyInboundEmail({ subject, body });
return withActor("", async (tx) => {
  // 1. match: identifier, else jurisdiction+itemType, account-scoped
  // 2. itemId = matched ?? (insert a `pending` DRAFT)
  // 3. for each attachment: uploadBytes() + insert file_attachment
  // 4. if renewal_notice && a file exists → insert extraction_proposal
});
```

- **`classifyInboundEmail`** (`classify.ts`) is the OCR pattern from code
  note 04 reused for text: forced Claude tool → zod re-validate → defensive
  parse. If no API key it returns a *neutral* result so inbound still files
  a draft — degrade, don't crash.
- **`withActor("")`** — inbound has no logged-in user. Empty actor → the
  audit trigger records `NULL` ("system"). The file/item writes are still
  audited; we just honestly don't attribute them to a person.
- **Match order matters:** exact `identifier` is strong evidence; fall back
  to `jurisdiction + itemType`. Both queries are `account`-scoped and
  `archivedAt IS NULL` — you can't match into another tenant or a dead row.
- **No match → a DRAFT** (`status: 'pending'`), not silent drop. The
  operator sees it in Items like anything else.
- **Renewal → a proposal, never a write.** Same hard rule as OCR: inbound
  can *suggest*; only the user applies. The proposal needs `file_id`
  (FK) — so a body-only renewal updates the draft but can't file a proposal.
  That constraint is a *consequence of the schema*, documented, not a bug.

## 3. `postmark-inbound/route.ts` — transport only

```ts
if (secret && url.searchParams.get("secret") !== secret)
  return new Response("Forbidden", { status: 403 });
const slug = recipientLocalPart(payload);          // {slug}@inbound…
const [acct] = await db.select…where(eq(account.slug, slug));
if (!acct) return new Response("Unknown inbox", { status: 200 });   // ← note
return Response.json(await processInboundEmail(acct.id, {…}));
```

- Postmark **doesn't sign** inbound payloads → a shared `?secret=` gate;
  unset in dev so the simulator path needs no secret.
- **Unknown inbox → 200, not 404.** A webhook that returns an error makes
  the provider *retry forever*. "I received it, there's nothing to do" is a
  success from Postmark's perspective. Getting webhook status codes right is
  a real operational skill: 2xx = "stop sending me this", 5xx = "retry".
- The route knows nothing about Claude, matching, or drafts. Swap Postmark
  for SES tomorrow → only this file changes.

## 4. SMS channel — two small, surgical changes

**`schedule.ts`** (recompute) gained ~6 lines:

```ts
const channels = ["email"];
if (acct && PLANS[acct.planTier].sms && acct.smsPhone) channels.push("sms");
const taken = new Set(existing.map(e => `${e.channel}:${e.kind}:${e.offsetDays}`));
const rows = channels.flatMap(channel => targets.filter(…).map(t => ({ …, channel })));
```

- Email always; SMS **only** if the plan allows (`PLANS[tier].sms`,
  Pro/Fleet) **and** a phone exists. Plan rule from the brief, enforced at
  schedule time.
- The dedupe key gained `channel:` — without that, the email and SMS rows
  for the same kind+offset would collide and one would be dropped. A
  one-token change with real correctness impact (this is the kind of thing
  code note 06's "gotchas" warned about).

**`dispatch.ts`** branches by `d.channel`: SMS builds a short text (label +
signed ack link + "Reply OK"); missing phone → `skipped` *with a reason*,
not a hard `failed` (it's a config gap, not a send error). Email path is
untouched — the change is additive.

## 5. `acknowledgeBySmsReply` — same rule, new transport

```ts
if (body.trim().toUpperCase() !== "OK") return { ok:false };
const acct = …where(eq(account.smsPhone, fromPhone));
const d = …channel sms, status sent, acknowledgedAt null, order by sentAt desc;
await acknowledgeDispatch(d.id);
```

It resolves the account *by the sender's phone*, finds the latest unacked
SMS reminder, and delegates to the existing idempotent
`acknowledgeDispatch` (code note 06). So "reply OK" and "click the email
link" converge on the **one** function that writes `acknowledgedAt` — the
brief's "only the user, never auto" stays structurally true across both
channels.

## 6. The simulators (`lib/trpc/routers/inbound.ts`)

`simulateEmail` builds an `InboundEmail` and calls `processInboundEmail`
with `ctx.account.accountId`. `simulateSmsOk` looks up the account phone and
calls `acknowledgeBySmsReply(phone, "OK")`. They're `protectedProcedure`s —
account-scoped, auth-gated — and contain **zero** logic of their own. That's
the point: the thing you click in Settings runs the production code path.

---

## 7. Build it yourself (exercise)

Add a "confirmation" handler: when `cls.category === "confirmation"` and it
matched an item, append a note to that item instead of filing a proposal.

1. In `process.ts`, after the match block, branch on `cls.category`.
2. For `confirmation` + `matchedId`: `tx.update(complianceItem).set({ notes:
   … }).where(eq(id, matchedId))` (append, don't clobber).
3. Run `npm run typecheck`; trigger it via Settings → Simulate inbound email
   with a "confirmation"-ish subject. You just extended a production webhook
   by testing entirely through the simulator — no Postmark.

## 8. Gotchas

- **Webhook status codes are an API.** 200 = "done, don't retry"; 5xx =
  "retry". Returning 500 for "unknown inbox" would make Postmark hammer you.
- **Dedupe keys must include every dimension** that can legitimately
  coexist. Adding SMS without adding `channel:` to the key silently drops
  half the reminders.
- **`withActor("")` is intentional**, not a bug — system-attributed audit
  rows are correct for provider-initiated events.
- **Simulator must call the same function as the webhook**, not a parallel
  copy. The moment they diverge, "tested in dev" stops meaning "works in
  prod".
- **`skipped` vs `failed`:** a missing phone is a config gap (`skipped`,
  benign); an adapter throw is `failed` (actionable). Don't conflate — the
  dashboards and retry logic read these.
