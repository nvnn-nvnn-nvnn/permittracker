# Phase 10 — Explained (teaching walkthrough)

The final phase: retention beyond reminders. A monthly, per-jurisdiction
"inspection-prep digest" — Claude-written, admin-editable, emailed, and
surfaced in-app, scoped to the jurisdictions an account actually operates in.

---

## The flows

```
Monthly cron (1st, 13:00 UTC) / admin "Generate & send now"
  → for each seeded MN jurisdiction: ensureDigest(j, period)
        existing row? keep it (admins may have edited)   [idempotent]
        else → Claude (forced tool) → title + sections → store published
  → for each account:
        jurisdictions = distinct from its trucks + items
        digests = published rows for those jurisdictions this period
        email the owner a teaser + link            (Resend, or no-op)

In-app: dashboard widget + /digest read the SAME digestsForAccount()
```

## 1. Shared content, not tenant data — a different table shape

Every prior entity carries `account_id` + RLS member scoping. A digest is
**reference content shared across tenants**: one row per
`(jurisdiction, period)`, no `account_id`. So:

- RLS is `SELECT … USING (true)` for `authenticated` (migration `0016`) —
  everyone may read it; writes are service/admin only.
- No audit trigger — it's regenerated monthly, not a record of tenant
  action.
- Personalization happens at **read time** by *resolving* which
  jurisdictions an account touches, not by copying a digest per account.
  `accountJurisdictions()` = `distinct(jurisdiction)` UNION over the
  account's non-archived trucks + items. One body of content, fanned out by
  a query — no duplication, no per-account rows to keep in sync.

## 2. Idempotent generation (`ensureDigest`)

Keyed by the unique `(jurisdiction, period)`. If a row exists it's left
alone — so re-running the cron, or an admin clicking "generate" twice,
never overwrites human edits or burns Claude tokens. Only a *missing*
(jurisdiction, period) calls the model. Same "force a tool, re-validate with
zod, store" discipline as the OCR pipeline (code note 04); content is stored
as constrained markdown (`### Heading` + paragraphs) so the in-app renderer
needs no markdown dependency.

If `ANTHROPIC_API_KEY` is absent the generator returns
`{ created:false, skipped:"no-key" }` — the run still proceeds, just
produces nothing. Resilient, like every external dependency in this build.

## 3. One pipeline, cron + manual (the pattern, final time)

`runMonthlyDigests(period?)` does generate-then-email for all accounts. The
Inngest monthly cron and the admin "Generate & send now" button both call
exactly it — identical behaviour, demoable on demand without waiting for the
1st. This is the same cron+manual seam used for OCR, reminders, SMS, and
voice; by now it's the house style.

## 4. Advisory, explicitly

The prompt asks for general guidance and the UI + email both label it
"general guidance for your area — not legal advice." A compliance product
must not imply the AI's monthly tips are authoritative; the operator's
jurisdiction is always the source of truth. This mirrors the brief's
"never claim renewed from OCR" instinct — the AI assists, it doesn't
certify.

---

## Files that matter

- `lib/db/schema.ts` — `jurisdiction_digest`; `0015` + `0016` (shared-read
  RLS).
- `lib/digest/generate.ts` — idempotent Claude generation per (j, period).
- `lib/digest/resolve.ts` — account→jurisdictions + digestsForAccount.
- `lib/digest/run.ts` — generate-all-then-email pipeline.
- `lib/digest/email.ts`, `period.ts`.
- `inngest/functions/digest.ts` — monthly cron (registered in `/api/inngest`).
- `lib/trpc/routers/digest.ts` — `forMyAccount`; admin `digestList` /
  `generateAndSendDigests` / `editDigest` in `admin.ts`.
- `app/(app)/digest/page.tsx`, dashboard widget, sidebar nav,
  `components/features/digest-content.tsx`, `digest-admin.tsx`.

## How to demo

1. Ensure a truck/item has a Twin Cities jurisdiction (e.g. "Minneapolis
   Health Department").
2. **/admin → Generate & send now** → digests are Claude-written for the
   seeded MN jurisdictions; accounts get an email (Resend live, or logged).
3. **Dashboard** shows the "Inspection prep · your area" widget;
   **/digest** renders the full content for your jurisdictions.
4. Admin can edit a digest (title/body) — it stays published, attributed to
   the editor.
