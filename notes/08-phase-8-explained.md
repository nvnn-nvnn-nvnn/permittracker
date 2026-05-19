# Phase 8 — Explained (teaching walkthrough)

The "Pro" phase: a phone call when nothing else got acknowledged, plus two
new entities — Venues (COI requirements) and People (staff whose certs
cascade across the trucks they work).

---

## The flows

```
7 days out, Pro+, phone set → schedule a `voice` dispatch
Cron / Run-now → for a voice dispatch:
   if ANY prior reminder for that item was acknowledged → skip (brief)
   else → Twilio call with TwiML <Gather> "press 1"
   caller presses 1 → /api/webhooks/twilio-voice?token=… → acknowledge

Person has certs (compliance_items.person_id) + assigned trucks
   cert expired → every ACTIVE assigned truck → RED   (cross-truck cascade)
COI item.venue_id → Venue holds the additional-insured / COI requirements
```

## 1. Voice = a third channel, not a new system

`reminder_dispatch.channel` already had `voice` (Phase 4 foresight). Phase 8
just turns it on, exactly like SMS in Phase 7:

- **`lib/voice/index.ts`** — Twilio Programmable Voice via REST (no SDK),
  or a logging no-op. Same adapter seam as email/SMS.
- **`schedule.ts`** adds **one** `voice` dispatch, only for the
  `expiry`+`offsetDays === 7` target, only when
  `PLANS[tier].voiceEscalation` (Pro+) and a phone exists. Not a blanket
  channel — escalation is a single, deliberate call.
- **`dispatch.ts`** voice branch enforces the brief's key rule at **send
  time**: *only call if NO prior reminder for the item was acknowledged.*
  If the operator already clicked an email/SMS ack, the call is `skipped`
  with a reason. (Schedule time can't know this; send time can.)
- The TwiML `<Gather numDigits="1">` posts to `/api/webhooks/twilio-voice`
  with the **same signed token** email/SMS use. So "press 1" is just another
  authenticated path into the one idempotent `acknowledgeDispatch` — the
  "only the user, never auto" guarantee holds across all three channels.

## 2. Venue — requirements live with the venue, not copied onto COIs

`venue` holds `additional_insured_text` + `coi_requirements`. A COI
`compliance_item` links via `item.venue_id`. We deliberately **don't** copy
the requirement text onto each COI — the venue is the source of truth; the
COI just points at it. No cascade here: an expired COI on an active truck is
already RED via the existing item rule; the venue is organizational +
the additional-insured language you must match.

## 3. Person — the cross-truck cascade

A real `person` entity (may link to an auth `user`), plus a `person_truck`
join (which trucks they work). A certification is a normal
`compliance_item` with `person_id` set.

The new cascade in `lib/status.ts`: one query joins
`person_truck → person → truck`, filtered to **active, non-archived**
trucks, building `personId → {name, truckNames[]}`. Then for every urgency
whose `item.personId` is expired/expiring, the person's active trucks are
flagged — **RED if expired**, YELLOW if expiring (same severity model as the
commissary cascade, your choice). One expired food-handler cert can red-flag
every truck that person runs — which is the real-world point.

`person_truck` is a hard-deletable join (re-synced on every person save), so
like `reminder_dispatch` it has **no audit trigger**; `venue` and `person`
do (they're first-class records — `audit_entity` gained both, trigger reused).

## 4. Simulators (same pattern, third time)

`inbound.simulateVoicePressOne` finds the latest sent, unacked `voice`
dispatch for the account and calls `acknowledgeDispatch` — the exact path
the Twilio `<Gather>` webhook takes. Settings now has all three:
inbound-email, SMS "OK", voice "press 1". No Twilio/A2P needed to demo the
full escalation ladder.

---

## Files that matter

- `lib/voice/index.ts` — Twilio-voice-or-noop adapter + escalation TwiML.
- `lib/reminders/schedule.ts` — the single 7-day voice target (Pro+).
- `lib/reminders/dispatch.ts` — voice branch + "skip if prior ack".
- `app/api/webhooks/twilio-voice/route.ts` — `<Gather>` press-1 → ack.
- `lib/db/schema.ts` — `venue`, `person`, `person_truck`; item
  `person_id`/`venue_id`; `0012`/`0013` migrations.
- `lib/trpc/routers/venue.ts`, `person.ts` — CRUD (+ truck-assignment sync).
- `lib/status.ts` — person-cert cross-truck cascade.
- `components/features/venue-form.tsx`, `person-form.tsx`; venues/people
  pages; sidebar nav; item form Person/Venue selects.

## How to demo

1. **People → Add person**, assign 1–2 trucks. **Items → Add item**:
   itemType `certification`, set **Person** = that person, expiration =
   yesterday → save. Dashboard goes **RED** citing the person + the trucks
   they're assigned to (cross-truck cascade).
2. **Venues → Add venue** with COI requirements; on a COI item set
   **Venue** to link it.
3. On a **Pro** plan with an SMS phone set, save an item that has a
   **7-day** reminder offset → its voice dispatch schedules. **Run due
   reminders now**; then Settings → **Simulate voice "press 1"** → the
   escalation is acknowledged (and note: if you'd already acked the
   email/SMS first, the voice call would have been skipped).
