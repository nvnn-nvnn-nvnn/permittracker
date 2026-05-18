# Phase 4 — Explained (teaching walkthrough)

Reminders. The whole point of PermitKeep: warn the operator *before* a permit
lapses. This phase turns the per-item day offsets into actual sent emails
with a one-click acknowledge, and a dashboard that escalates if you ignore
them.

---

## The flow, end to end

```
Save an item (create / edit / archive, or OCR Apply)
  → recomputeDispatches(tx, item)   [same transaction as the write]
      → wipes future "scheduled" rows, rebuilds them from:
          • each reminder offset you picked  (kind = expiry)
          • 45 days before expiry, if a fee due date exists (kind = fee)

Every 5 min: Inngest cron  ──┐   (or)  "Run due reminders now" button
                             ├─→ processDueDispatches()
                             │     → find scheduled rows due now
                             │     → email the account owner (Resend)
                             │     → mark sent / failed / skipped
Email → "Acknowledge" link (signed token)
  → /api/reminders/acknowledge?token=…  → marks acknowledgedAt
Dashboard: a sent reminder unacked > 48h  → account goes YELLOW
```

---

## 1. Why we did NOT add a ReminderSchedule table

The brief lists a `ReminderSchedule` entity. But the per-item offsets already
live on `compliance_item.reminder_days_before` (the chips you set in Phase
2/3). Adding a second table would **duplicate** that data and create a
sync problem. Decision (logged in `00-decisions.md`): **treat the item's
offsets as the schedule**, and only add `reminder_dispatch` — the log of
reminders actually sent/attempted. Less data, one source of truth. This is a
scope decision, not a stack deviation.

`reminder_dispatch` is also the one tenant table with **no audit trigger**:
the brief explicitly allows hard-deleting dispatches, and we *recompute*
them whenever the item changes, so an immutable log would fight the design.

## 2. Recompute: the "schedule" is derived, not stored

`lib/reminders/schedule.ts` → `recomputeDispatches(tx, item)` runs **inside
the same transaction** as the item write (create/update/archive, and OCR
Apply — anywhere expiry/fee can change). Rules:

- Delete only still-`scheduled` rows; `sent`/`failed`/`skipped` are history
  and survive (so you can see what already went out).
- Build one target per offset: `scheduledFor = expirationDate − offset days`
  at 13:00 UTC. Plus a `fee` target 45 days before expiry if a fee due date
  exists (brief default).
- **Only future sends are created** — back-dating an item with a passed
  "30 days before" date does not blast an instant reminder.
- A target already covered by a non-scheduled row isn't recreated (no dupes).

Because it's transactional, the schedule and the item can never disagree.

## 3. The signed acknowledge token (no DB session needed)

`lib/reminders/token.ts`. The email's Acknowledge link must work from an
inbox with no login. We can't trust a raw `dispatchId` in a URL — anyone
could guess one. So the token is:

```
base64url({ d: dispatchId, e: expiry }) + "." + base64url(HMAC_SHA256(payload, SECRET))
```

On click, the server recomputes the HMAC with `REMINDER_TOKEN_SECRET` and
compares with `timingSafeEqual`. Tamper with the id → signature fails.
14-day expiry baked into the payload (brief). It's **stateless**: validity is
pure crypto; the DB is only touched to apply the effect. That's why the
secret matters — it's the only thing preventing forged acknowledgements.

## 4. Acknowledgement is ONLY ever the user

`/api/reminders/acknowledge` is a plain REST route (not tRPC — it's an
external link, like the webhooks). It verifies the token, then sets
`acknowledgedAt`. Nothing else, anywhere, sets that column. This implements
the brief "never auto-acknowledge a reminder" as a structural guarantee, not
a convention.

## 5. Sending: the adapter pattern pays off

`lib/email/index.ts` resolves to the **real Resend SDK** when
`RESEND_API_KEY` is set, else a logging no-op — chosen once, lazily.
`processDueDispatches` (`lib/reminders/dispatch.ts`) never knows which; it
just calls `emailAdapter.send`. So "wire Resend" was a one-file change with
zero edits to the dispatch logic — exactly what the Phase 1 stub interfaces
were for. Recipient = the account owner's email. Dev sends use Resend's
shared `onboarding@resend.dev` (only delivers to the Resend account owner);
production needs a verified domain in `EMAIL_FROM`.

## 6. Cron + manual fallback (your choice)

`inngest/functions/reminders.ts` is a real `*/5 * * * *` cron calling
`processDueDispatches()`. The tRPC `reminder.runDueNow` calls the **same**
function scoped to the caller's account — so a demo works with no Inngest
dev server running. Identical behaviour either way (same lesson as Phase 3's
OCR run-now).

## 7. The deferred Phase 2 clause, finally wired

`lib/status.ts` now also asks: *is there a `sent` dispatch, unacknowledged,
older than 48h, on a non-archived item?* If yes → the account is at least
**YELLOW** with the reason "A sent reminder is unacknowledged after 48
hours." This is the brief's exact third YELLOW condition, which we couldn't
implement until reminders existed.

---

## Files that matter

- `lib/db/schema.ts` — `reminder_dispatch` + enums; `0006`, `0007` migrations.
- `lib/reminders/token.ts` — signed acknowledge tokens.
- `lib/reminders/schedule.ts` — derive dispatch rows from item offsets.
- `lib/reminders/email.ts` — the reminder email.
- `lib/reminders/dispatch.ts` — send loop + `acknowledgeDispatch`.
- `lib/email/index.ts` — Resend-or-noop adapter.
- `inngest/functions/reminders.ts` + `app/api/inngest/route.ts` — the cron.
- `lib/trpc/routers/reminder.ts` — history query + run-now.
- `app/api/reminders/acknowledge/route.ts` — one-click link target.
- `components/features/reminders-panel.tsx` — per-item history UI.
- `lib/status.ts` — the 48h-unacked YELLOW clause.

## How to demo Phase 4

1. Ensure `.env.local` has `RESEND_API_KEY` and `REMINDER_TOKEN_SECRET`
   (done). Restart `npm run dev` so they load.
2. Edit an item: set the **expiration date to ~7 days out** and make sure a
   reminder offset like "7 days before" is selected → save. Open the item →
   **Reminders** card shows a scheduled row.
3. To fire immediately: set an offset whose date is today (e.g. expiration
   = today, "Day of" selected), save, then click **Run due reminders now**.
4. Check the email (to your Resend account owner address). Click
   **Acknowledge** → confirmation page → the Reminders card flips to
   "acknowledged".
5. To see the escalation: leave a sent reminder unacknowledged; after 48h
   (or temporarily tweak the cutoff to test) the dashboard turns **YELLOW**
   with the unacknowledged reason.
6. Optional async path: `npx inngest-cli@latest dev` → the 5-min cron runs
   on its own.

---

## Post-sign-off fix — "catch-up" reminders (2026-05-18)

**Symptom (owner):** "Not receiving any emails." **Diagnosis:** not a bug —
the only dispatch was correctly `scheduled` for 13:00 UTC and it was 12:26
UTC, so "Run due reminders now" rightly skipped it (it only sends rows whose
time has passed). But debugging it surfaced a real design flaw.

**The flaw:** recompute only *created* dispatches whose send-time was in the
**future**, and the processor only *sends* ones that are **due (past)**. So:

1. A freshly-created reminder is always future → can never fire immediately
   (bad for demo/testing).
2. Worse — an item added *late* (or expiring sooner than its biggest offset,
   e.g. add today, expires in 3 days, "7-days-before" selected) had its only
   reminder time already in the past → recompute **dropped it** → the most
   urgent item produced **zero warnings**. That contradicts the product.

**The fix (`lib/reminders/schedule.ts`):** a `consider()` helper now clamps.
For each offset:

- send-time still in the future → schedule normally;
- send-time in the past **but the item has not expired yet** → clamp
  `scheduledFor = now` (a *catch-up* send — goes out on the next cron tick /
  "Run due reminders now");
- item already expired → still skip (the dashboard's RED/expired state owns
  that; a late "expires soon" email would be wrong/noise).

A non-null `expiration` local is captured after the guard so the closure
keeps the narrowed type. `stillRelevant = expirationDay >= todayDay` (UTC,
date-level). Dedupe vs already-sent rows is unchanged, so a catch-up that
sends won't be recreated on the next recompute.

**Net effect:** late/urgent items now warn promptly, and Phase 4 is
demoable on demand (add an item expiring within any selected offset → Run
due reminders now → email goes).

### Caveat that will still bite

`EMAIL_FROM` defaults to Resend's shared `onboarding@resend.dev`, which only
delivers to the **Resend account's own signup email**. If that differs from
the PermitKeep account-owner email the dispatch is marked `sent` but no mail
arrives. Use a verified-domain sender for real delivery. Also: `sent` means
"Resend accepted it", not "inbox delivered" — a delivery webhook is deferred
to Phase 7. Both logged in `00-decisions.md` → Known caveats.
