# PermitKeep — Project Guide

> Repo codename **PermitKeep**; public brand **CartLedger**. Full product
> orientation: `notes/02-product-overview.md` (read it to get up to speed).

The **operating system for food trucks** — a two-pillar SaaS that keeps a truck
**legal** and **profitable**, on top of the tools operators already use (Square,
QuickBooks) rather than replacing them.

- **Stay open (compliance):** permits, inspections, certs, COIs, commissary
  deps, truck-modification log; reminds before expiry.
- **Stay profitable (operations, Pro+):** Square sales → daily/weekly/monthly
  P&L, inventory (auto-depleted from sales via recipes), recipes/COGS,
  purchasing, expenses, menu analysis, QuickBooks export, truck service status.

Positioning: **"Stay open. Stay profitable."** Hard boundary: we are the brain
on top of Square + QuickBooks, **never a POS / ordering / accounting tool**
(see `notes/00-decisions.md` → Tier A/B decision). All paid + 14-day
card-required trial; ops pillar gated to Pro+.

## Stack (do not deviate without logging in notes/00-decisions.md)

Next.js 15 App Router · TypeScript strict · Tailwind · shadcn/ui · tRPC
(internal) · REST (external webhooks) · Postgres/Supabase · Drizzle ORM ·
Supabase Auth (email + magic link) · Supabase Storage · Inngest · Anthropic
Claude (vision OCR) · Resend (out) / Postmark (in) · Twilio · Stripe · Sentry ·
PostHog · Vercel.

> Note: `create-next-app` defaults to Next 16; we pinned Next 15 per brief.
> Stripe/Twilio/Resend/Postmark are stubbed behind adapters until their phase.

## Working principles

- Ship vertical slices; each phase demos end-to-end.
- TS strict everywhere. No `any` without a justifying comment.
- Server Components by default; client only when interactivity demands it.
- All DB access through Drizzle. Raw SQL only in migrations/audit triggers.
- Every mutation goes through tRPC. No direct DB writes from client code.
- Audit log is append-only, enforced by a Postgres trigger.
- Mobile-first. Test every screen at 375px.
- Ask before adding dependencies outside the stack.

## Never do

- Never write to `audit_log` except via the trigger.
- Never bypass tRPC for client mutations.
- Never trust `account_id` from the client — derive from the session.
- Never log permit/COI numbers or extracted document text to Sentry/PostHog.
- Never auto-acknowledge a reminder. Only the user acknowledges.
- Never hard-delete a ComplianceItem. Archive only.
- Never claim "renewed" from OCR alone. The user confirms.

## Notes discipline

`notes/` is the shared memory. `00-decisions.md` = binding decisions +
deviations. `01-phase-log.md` = append-only build log. Update them as you go.

## Folder layout

See brief; mirrored under `app/`, `components/`, `lib/`, `inngest/`. Admin is
role-gated at `app/(app)/admin` (same app).
