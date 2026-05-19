# Phase 7 — Explained (teaching walkthrough)

Two inbound channels: forward a renewal email and PermitKeep files it;
get reminders by SMS and reply "OK" to acknowledge. Both providers
(Postmark, Twilio) are stubbed — built behind adapters with **dev
simulators** so the real pipelines are fully exercisable now.

---

## The flows

```
Renewal email → {slug}@inbound.permitkeep.com
  → Postmark parses → POST /api/webhooks/postmark-inbound
      → resolve account by recipient slug
      → store attachments (service role, "unassigned" path)
      → Claude classifies: renewal_notice | confirmation | reminder | unrelated
      → match existing item (identifier, or jurisdiction+type)
          matched → attach files (+ proposal if renewal)
          no match → create DRAFT item (status 'pending') for review
  (dev: Settings → "Simulate inbound email" calls the SAME core)

Reminder due, account on Pro+ with a phone
  → schedule.ts also creates an `sms` dispatch alongside `email`
  → dispatch.ts sends via SMS adapter (Twilio REST, or no-op)
Operator texts "OK" → POST /api/webhooks/twilio-inbound
  → resolve account by sender phone → ack most recent sent SMS reminder
  (dev: Settings → 'Simulate SMS "OK"')
```

---

## 1. Adapters again — the stub seam keeps paying off

`lib/sms/index.ts` mirrors the email adapter exactly: real **Twilio**
(called via plain REST `fetch`, no SDK dependency added) when
`TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER` are set; otherwise a logging
no-op. `getSmsAdapter()` resolves once, lazily. The dispatch loop never
knows which — same lesson as Resend/Stripe: stub-resilient now, live on key
add with zero call-site changes.

## 2. Inbound email — the account is the address

Each account already has a unique `slug`. Its forward-to address is
`{slug}@inbound.permitkeep.com`. The webhook reads the recipient's
local-part and looks up the account by slug. Unknown inbox → **200** (not an
error): Postmark must not retry an unroutable address forever.

Postmark doesn't sign inbound payloads, so the endpoint is gated by a shared
`?secret=` (`POSTMARK_INBOUND_SECRET`); unset in dev → check skipped. The
**real work is in `lib/inbound/process.ts`**, which the dev simulator
(`inbound.simulateEmail`) calls with the same arguments — so what you test
in Settings is exactly what Postmark triggers in production.

## 3. Classify, then match-or-draft (never auto-apply)

`lib/inbound/classify.ts` reuses the OCR pattern (code note 04): force a
Claude tool, re-validate with zod, return `{category, documentType,
jurisdiction, identifier, expirationDate, holderName, confidence}`. If
Anthropic isn't configured it returns a neutral result — inbound still
stores the file and makes a draft, just without smart matching.

Matching (`process.ts`): try exact `identifier`, then
`jurisdiction + itemType`, scoped to the account, non-archived.
- **Matched** → attach the file(s) to that item; if it's a `renewal_notice`,
  file an `extraction_proposal` (pending) so the user **confirms** — we never
  mutate the item from an email (brief: never claim renewed from OCR/inbound).
- **No match** → create a **draft** ComplianceItem (`status: 'pending'`,
  notes "Created from forwarded email: …") + attach files. The operator
  reviews it like any item.

A proposal needs a `file_id` (FK), so a body-only renewal with no attachment
creates/updates the draft but skips the proposal — documented limitation.

## 4. SMS as a real reminder channel (Pro+)

`reminder_dispatch.channel` already had `email | sms | voice` (Phase 4
foresight). Phase 7 turns SMS on:

- **`schedule.ts`** now reads the account's `plan_tier` + `sms_phone`. Email
  is always scheduled; an **SMS** dispatch is added too **iff**
  `PLANS[tier].sms` (Pro/Fleet) **and** a phone is set (brief: "SMS
  additionally on Pro and above"). The dedupe key gained `channel` so email
  and SMS for the same kind+offset coexist.
- **`dispatch.ts`** branches on `d.channel`: SMS → short body with the
  signed acknowledge link + "Reply OK"; missing phone → `skipped` with a
  reason (not a hard failure). Email path unchanged.

## 5. Reply "OK" → acknowledge (still user-only)

`acknowledgeBySmsReply(fromPhone, body)`: if the body is exactly "OK",
resolve the account by `sms_phone`, find its most recent **sent, unacked**
SMS dispatch, and acknowledge it (reusing `acknowledgeDispatch`, idempotent).
`/api/webhooks/twilio-inbound` parses Twilio's form post and returns empty
TwiML (no auto-reply). This keeps the brief's hard rule intact: a human
texting OK is the *only* SMS path to `acknowledgedAt` — nothing automatic.

## 6. Why simulators, not just webhooks

Postmark/Twilio can't reach `localhost` without tunneling, and A2P 10DLC
approval takes weeks. The simulators (`inbound.simulateEmail`,
`inbound.simulateSmsOk`, in Settings) call the **exact same core functions**
the webhooks call, scoped to your account. So the classify→match→draft and
reply-OK→ack pipelines are real and demoable today; only the transport is
deferred until keys exist.

---

## Files that matter

- `lib/sms/index.ts` — Twilio-or-noop adapter.
- `lib/inbound/classify.ts` — Claude email classifier.
- `lib/inbound/process.ts` — store → classify → match-or-draft → proposal.
- `app/api/webhooks/postmark-inbound/route.ts` — real inbound endpoint.
- `app/api/webhooks/twilio-inbound/route.ts` — inbound SMS ("OK").
- `lib/reminders/schedule.ts` — SMS channel added (Pro+ + phone).
- `lib/reminders/dispatch.ts` — channel-branched send + `acknowledgeBySmsReply`.
- `lib/trpc/routers/inbound.ts` — the dev simulators.
- `lib/trpc/routers/account.ts` — `notificationSettings` / `setSmsPhone`.
- `components/features/notifications-panel.tsx` — Settings UI.

## How to demo

1. Settings → set an SMS number (any E.164, e.g. `+16125551234`) → Save.
2. **Simulate inbound email** with the prefilled subject/body → see the
   result: "renewal_notice · created draft · proposal filed". Check
   **Items** → a new pending draft; open it → file + a proposal to confirm.
3. Put the account on Pro (Phase 5 billing) so SMS is enabled, save an item
   with a due reminder, **Run due reminders now** → an `sms` dispatch sends
   (no-op logs without Twilio).
4. **Simulate SMS "OK"** → the most recent SMS reminder flips to
   acknowledged (dashboard's 48h-unacked clause clears).
