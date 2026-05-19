# Phase 9 — Explained (teaching walkthrough)

The internal **ops cockpit**: one cross-tenant screen where a platform
operator works the concierge queue and watches accuracy + dispatch health.

---

## The big idea: role-gated, NOT tenant-scoped

Every other read in PermitKeep is scoped to *your account* (RLS + the
session-derived `account_id`). Admin is the deliberate exception:

```
adminProcedure  → throws unless ctx.account.isPlatformAdmin
              → reads via the service-role db (RLS bypassed)
              → sees ALL accounts
```

This is safe **only** because `adminProcedure` (Phase 1) blocks every
non-admin before a query runs. The gate is the role flag, not membership.
If you remove that gate, this router leaks every tenant's data — so the
security lives entirely in `adminProcedure`, and the router is otherwise
free to read across tenants.

Every *write* still goes through `withActor(ctx.account.userId, …)`, so a
platform intervention is attributed to the operator in the same append-only
audit log as normal user actions. Admins act *on the record*, not *around*
it.

## 1. The concierge queue (three feeds, one screen)

`admin.conciergeQueue` unions three "needs a human" sources, each joined to
the account name:

- **Low-confidence files** — `file_attachment.needs_manual_review = true`
  (set by the OCR pipeline when expiry confidence was low).
- **Inbound drafts** — `compliance_item.status = 'pending'` whose notes
  start with the inbound marker (`Created from forwarded email:%`). These
  are the unmatched forwarded emails from Phase 7.
- **Concierge onboarding** — accounts with `concierge_purchased_at` set but
  `concierge_completed_at` null (the new Phase 9 column).

Resolve actions, all `adminProcedure` + audited:
- `markFileReviewed` → clears the manual-review flag.
- `resolveProposal({apply|reject})` → applies the OCR proposal to the
  account's item (reusing the exact field-merge + `recomputeDispatches`
  logic from the per-account flow) or rejects it — cross-account, by id.
- `dismissDraft` → archives a junk inbound draft (soft delete, audited).
- `markConciergeComplete` → stamps `concierge_completed_at` → off the queue.

The "done" markers (`needs_manual_review=false`, `archivedAt`,
`concierge_completed_at`) are how an item *leaves* the queue — the queries
filter on exactly those, so resolving an item makes it disappear on refresh.

## 2. Metrics that are proxies, labelled as such

- **OCR accept rate** = `applied / (applied + rejected)` over
  `extraction_proposal`. It's a *proxy* for accuracy (did a human keep what
  Claude proposed?), not ground truth — named `acceptRatePct` and `null`
  until any proposal is decided, so the UI shows "—" instead of a fake 0%.
- **Dispatch monitor** = `reminder_dispatch` grouped by status + the last 10
  `failed` rows with their error. This is the operational "are reminders
  actually going out" view, the counterpart to the Phase 4 send loop.

No new tables for metrics — they're aggregate queries over data we already
keep. Cheap, always live, nothing to backfill.

## 3. Why the UI is a server shell + one client island

`app/(app)/admin/page.tsx` (Server Component) does the three admin reads in
parallel and renders static cards (overview tiles, accuracy, dispatch
monitor, recent OCR). Only the **queue** is a client island
(`admin-queue.tsx`) because its rows have buttons that mutate + refresh —
the same "server fetches, small client island acts, `router.refresh()`
re-syncs" pattern from code note 03, applied one more time.

---

## Files that matter

- `lib/trpc/routers/admin.ts` — `overview`, `conciergeQueue`, resolve
  mutations; cross-tenant, role-gated, writes via `withActor`.
- `app/(app)/admin/page.tsx` — server cockpit (tiles + accuracy + dispatch
  + recent OCR).
- `components/features/admin-queue.tsx` — the actionable queue island.
- `lib/db/schema.ts` — `account.concierge_completed_at`; migration `0014`.

## How to demo

1. Make yourself platform admin (once):
   `update app_user set is_platform_admin = true where email = '<you>';`
2. Trigger queue items: upload a blurry permit (low-confidence →
   manual-review file); `inbound.simulateEmail` with a junk subject
   (inbound draft); buy concierge in billing (concierge account).
3. Open **/admin** → see the counts, accuracy, dispatch monitor, and the
   three-section queue. Use **Mark reviewed / Dismiss / Mark complete** →
   the row clears on refresh, and the action shows in that entity's audit
   trail attributed to you.
