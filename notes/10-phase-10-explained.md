# Phase 10 — Explained (plain-language walkthrough)

The final feature: a monthly **inspection-prep digest**. Once a month, Claude
writes a short guide for each jurisdiction we cover (Minneapolis Health
Department, St. Paul Health Department, etc.). Every account that operates in
that jurisdiction gets the guide — in the app and by email.

The trick worth understanding is **how one digest serves many accounts** without
us copying it for each one.

---

## The big picture

> Our script generates one digest per month, per jurisdiction, and stores it in
> a dedicated `jurisdiction_digest` table that every account can read.
>
> When it's time to email or display, the script looks at each account's
> trucks and compliance items, collects the list of jurisdictions that account
> actually operates in, then pulls the digests where the jurisdiction matches
> that list — and sends those to the owner.

That's the whole thing. The rest of this note is just unpacking it.

---

## 1. One digest, shared by everyone in that area

Most tables in this app are "tenant-scoped" — every row belongs to one account,
and you can only see your own rows. Trucks, permits, reminders, all work that
way.

Digests are different. A digest is **reference content**, like a help article.
The exact same Minneapolis guide should appear for every account that has a
truck in Minneapolis. So we built the table differently:

- It lives in its own table called `jurisdiction_digest`.
- There is **no `account_id` column**. The digest doesn't belong to anyone.
- There is exactly **one row per (jurisdiction, month)** — for example, one
  row for "Minneapolis Health Department / 2026-05".
- Every signed-in user is allowed to read every row. Only the system and
  admins can write to it.

Picture the table like this:

| jurisdiction                    | period   | title       | content      | status    |
|---------------------------------|----------|-------------|--------------|-----------|
| Minneapolis Health Department   | 2026-05  | May prep…   | (markdown)   | published |
| St. Paul Health Department      | 2026-05  | May prep…   | (markdown)   | published |
| Minneapolis Health Department   | 2026-06  | June prep…  | (markdown)   | draft     |

No account is mentioned anywhere. That's intentional.

## 2. How the script figures out who gets what

There's no "this account → this digest" link stored anywhere. The connection is
worked out fresh each time, by matching jurisdiction names.

For any given account, the helper `accountJurisdictions(accountId)` does this:

1. Look at all of the account's non-archived trucks → collect their
   jurisdictions.
2. Look at all of the account's non-archived compliance items (permits, certs,
   etc.) → collect their jurisdictions.
3. Combine the two lists and remove duplicates.

Result: a list like `["Minneapolis Health Department", "St. Paul Health Department"]`.

Then `digestsForAccount(accountId, period)` does step two:

> Give me every published digest for this month **where the jurisdiction is in
> that list**.

That's the filter. Same shared digest rows, different filter per account.

**Why this is nice:**

- Admin edits the Minneapolis digest once → every account in Minneapolis sees
  the update immediately.
- A user adds a new truck in St. Paul → next page load, the St. Paul digest
  just appears for them. No backfill job.
- Archive a truck → that jurisdiction quietly drops out of their view.

No per-account copies, no sync job, nothing to keep in step.

## 3. Generation: only write if it doesn't already exist

The generator is keyed by `(jurisdiction, period)`. Before it calls Claude, it
checks: does a row for this jurisdiction and this month already exist?

- **Yes** → leave it alone. Don't overwrite. (An admin might have edited it,
  and even if they didn't, there's no reason to burn API tokens regenerating
  the same content.)
- **No** → call Claude, get back a title and a few sections of markdown, save
  it as `published`.

This is what makes the cron safe to re-run, and the admin's "Generate now"
button safe to click twice. Same input, same outcome — nothing gets clobbered.

If `ANTHROPIC_API_KEY` isn't set, the generator just returns "skipped" and the
rest of the run continues. The pipeline never crashes because of a missing key;
it just produces nothing that month.

## 4. One pipeline, two triggers

`runMonthlyDigests(period?)` is the full pipeline: generate any missing digests
for the month, then walk every account, work out their jurisdictions, and email
them links to the relevant digests.

Two things call it:

- The **monthly Inngest cron** — runs automatically on the 1st of the month
  at 13:00 UTC.
- The **admin "Generate & send now" button** — same function, on demand. Lets
  you demo it without waiting for the 1st.

Same code path, identical behaviour. (This cron + manual-button pattern is the
same one we use for OCR, reminders, SMS, and voice — house style by this point.)

## 5. Advisory only, on purpose

The prompt asks Claude for "general guidance" and the UI + email both label the
content **"general guidance for your area — not legal advice."** This is a
compliance product; we never want to imply that the AI's monthly tips are
authoritative. The operator's actual jurisdiction is always the source of
truth. The AI assists, it doesn't certify — same instinct as "never claim
renewed from OCR alone."

---

## Files that matter

- `lib/db/schema.ts` — `jurisdiction_digest` table; migrations `0015` + `0016`.
- `lib/digest/generate.ts` — Claude generation per (jurisdiction, period),
  skips if a row already exists.
- `lib/digest/resolve.ts` — `accountJurisdictions()` and `digestsForAccount()`.
- `lib/digest/run.ts` — the generate-then-email pipeline.
- `lib/digest/email.ts`, `period.ts`.
- `inngest/functions/digest.ts` — the monthly cron.
- `lib/trpc/routers/digest.ts` — `forMyAccount`; admin
  `digestList` / `generateAndSendDigests` / `editDigest` in `admin.ts`.
- `app/(app)/digest/page.tsx`, dashboard widget, sidebar nav,
  `components/features/digest-content.tsx`, `digest-admin.tsx`.

## How to demo

1. Make sure a truck or compliance item has a Twin Cities jurisdiction
   (e.g. "Minneapolis Health Department").
2. **/admin → Generate & send now** → digests get written by Claude for the
   seeded MN jurisdictions; accounts receive an email (real send via Resend,
   or just logged if no key).
3. **Dashboard** shows the "Inspection prep · your area" widget;
   **/digest** renders the full content for the jurisdictions your account
   touches.
4. An admin can edit a digest's title or body — it stays published and the
   edit is attributed to that admin.
