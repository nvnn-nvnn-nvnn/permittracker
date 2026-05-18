# PermitKeep — Notes Index

Start here. This page is the map: what each phase is *for*, what got built,
and where to read the deep dive. Read the one-paragraph summary before opening
a dedicated explainer.

**Product in one line:** "Stay open. We track every permit, inspection, cert,
and COI that can shut a food truck down" — and remind operators before things
expire.

## How these notes are organized

| File | What it is |
|---|---|
| [`README.md`](README.md) | This index — per-phase purpose + status. |
| [`00-decisions.md`](00-decisions.md) | Binding decisions, scope calls, caveats. The "why we deviated" log. |
| [`01-phase-log.md`](01-phase-log.md) | Append-only build journal — what changed, when, verification. |
| `0N-phase-N-explained.md` | Teaching deep-dive for that phase (the *what/why/how* — the **reasoning**). |
| [`code/`](code/00-code-index.md) | **Code track** — the same features explained at the *code* level, line by line, to learn to build it yourself. Start at [`code/00-code-index.md`](code/00-code-index.md). |

Status legend: ✅ done & signed off · 🟡 built, awaiting sign-off · ⬜ planned.

> **Two tracks, on purpose.** `0N-phase-N-explained.md` = *why* (design,
> trade-offs, product reasoning). `code/` = *how* (the actual code,
> annotated, with build-it-yourself exercises). Read the phase explainer
> first, then the matching code note. The code track grows ~one note per
> phase as new patterns appear.

---

## Phase map

### ✅ Phase 1 — Foundation
**For:** the skeleton everything else hangs on. Auth (email + magic link),
multi-tenant Account/User/Membership, row-level security so one operator can
never see another's data, and the mobile-first app shell.
**Why it matters:** every later phase trusts that "you only ever see your
account's data" is enforced at the database, not just the UI.
Deep dive: build log in [`01-phase-log.md`](01-phase-log.md) (Phase 1).

### ✅ Phase 2 — Trucks, Compliance Items, Dashboard, Audit
**For:** the actual product data. Trucks and the polymorphic
ComplianceItem (permits/inspections/certs/COIs/vehicle), the
RED/YELLOW/GREEN dashboard computed server-side, and an **append-only audit
log enforced by a Postgres trigger** (the app physically cannot rewrite
history).
**Why it matters:** this is the core "is my truck legal today?" engine.
Deep dive: [`02-phase-2-explained.md`](02-phase-2-explained.md).

### ✅ Phase 3 — File upload + Claude OCR
**For:** stop typing permits in by hand. Upload a photo/PDF → Claude reads
it → suggested fields you confirm. Private storage via signed URLs, cost
tracked per call.
**Why it matters:** the data model is only useful if it's easy to fill;
OCR removes the manual-entry barrier. The user always confirms — OCR never
writes the item itself.
Deep dive: [`03-phase-3-explained.md`](03-phase-3-explained.md)
(incl. post-sign-off UX: reject→retry, reminder chips, inline preview,
spacing).

### 🟡 Phase 4 — Reminders
**For:** the promise in the tagline — warn *before* expiry. Per-item
schedule → `reminder_dispatch` rows → Inngest 5-min cron (or manual "run
now") → Resend email with a one-click, signed acknowledge link. Unacked
> 48h escalates the dashboard to YELLOW.
**Why it matters:** tracking is pointless if nobody's told in time. The
"catch-up" rule ensures even a late-added, soon-expiring item still warns.
Deep dive: [`04-phase-4-explained.md`](04-phase-4-explained.md).

### ⬜ Phase 5 — Payments
**For:** make it a business. Stripe Checkout for plan signup, Customer
Portal, plan-tier webhook, an `enforceLimits` tRPC middleware (truck/item
caps per plan), and the $49 concierge add-on. Stripe stays stubbed behind
the adapter until keys are added.

### ⬜ Phase 6 — Dependencies & commissaries
**For:** model the real world: a food truck depends on a licensed
commissary. If the commissary's permit lapses, every dependent truck is
flagged. Parent/child ComplianceItems; the status engine follows the chain.
(Schema already reserves `parent_item_id` + holder model from Phase 2.)

### ⬜ Phase 7 — Inbound email + SMS
**For:** forward a renewal notice to a per-account inbox address; Postmark
parses it, Claude classifies/matches it to an item. Twilio SMS reminders;
replying "OK" acknowledges.

### ⬜ Phase 8 — Voice escalation + Pro features
**For:** if SMS/email go unacknowledged, a Twilio voice call ("press 1 to
acknowledge"). COI venue linking; person certifications flagged across
trucks.

### ⬜ Phase 9 — Admin & concierge tooling
**For:** the internal cockpit. Concierge queue for human verification,
extraction-accuracy and cost dashboards, dispatch monitor. (The cost
dashboard already exists in skeleton at `/admin` from Phase 3.)

### ⬜ Phase 10 — Inspection-prep digest
**For:** retention value beyond reminders — a monthly per-jurisdiction
digest ("top violations in your area"), scoped to the Twin Cities, MN
launch metro. In-app widget + Resend email.

---

## Cross-cutting facts worth knowing once

- **Stack:** Next.js 15 (pinned), TypeScript strict, Tailwind v4 +
  shadcn, tRPC (internal) / REST (webhooks), Supabase (Postgres + Auth +
  Storage), Drizzle, Inngest, Anthropic, Resend; Stripe/Twilio/Postmark
  stubbed behind adapters until their phase. Full list +
  every deviation: [`00-decisions.md`](00-decisions.md).
- **Security spine:** account id is always derived from the session, never
  trusted from the client; RLS on every tenant table; audit log is
  trigger-enforced append-only.
- **Live integrations now:** Supabase, Anthropic (OCR), Resend (email).
- **Known caveats:** see the "caveats" section of
  [`00-decisions.md`](00-decisions.md) (e.g. Resend's shared dev sender
  only delivers to the Resend account owner; email "sent" ≠ "delivered"
  until a delivery webhook lands in Phase 7).
- **Phase ritual:** build → verify (typecheck/lint/clean build + live
  migration) → teaching note → commit → owner demo & sign-off → next phase.
