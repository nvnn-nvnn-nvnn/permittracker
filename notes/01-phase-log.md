# PermitKeep — Phase / Implementation Log

Append-only narrative of what was built, when, and why. Each entry: what
changed, key files, decisions made mid-flight, what was deferred.

---

## Phase 1 — Foundation — IN PROGRESS (started 2026-05-16)

Goal: runnable Next.js 15 app, TS strict, Tailwind + shadcn/ui, Drizzle schema
for Account/User/Membership with RLS, Supabase auth (email + magic link),
authenticated shell with sidebar.

### 2026-05-16 — kickoff
- Confirmed kickoff decisions (see `00-decisions.md`).
- git initialized, notes/ created.

### 2026-05-16 — Phase 1 complete

**Scaffold.** `create-next-app` → temp dir → moved to root. Pinned Next 15.5.18
(see decisions). Tailwind v4, TS strict (+extra flags). shadcn configured
(`components.json`, `lib/utils.ts`, oklch theme in `app/globals.css` incl. a
GREEN/YELLOW/RED `--status-*` palette). Base primitives hand-authored:
`button`, `input`, `label`, `card` (New York style; avoids the interactive
CLI — functionally identical, CLI still usable later).

**Folder structure.** Full brief layout created under `app/`, `components/`,
`lib/`, `inngest/`, `supabase/migrations/`.

**Data model (Phase 1 subset).** `lib/db/schema.ts` — enums `plan_tier`,
`membership_role`; tables `app_user` (id == Supabase `auth.users.id`),
`account` (slug, plan_tier, owner, archived_at), `membership`
(account_id+user_id unique, role). Shared `created_at/updated_at`. Generated
migration `0000_volatile_abomination.sql`. Hand-authored, journaled custom
migration `0001_rls.sql`: enables RLS on all three tables, SECURITY DEFINER
`permitkeep_is_member()` to avoid recursive policy eval, SELECT policies for
`authenticated`, no write policies for non-service roles (writes go through
tRPC on the service connection). Drizzle client lazy (`lib/db/index.ts`),
`drizzle.config.ts` + `db:*` npm scripts.

**Auth.** `@supabase/ssr` server client (`lib/auth/server.ts`), browser
client (`lib/auth/client.ts`), session-refresh + route-gating middleware
(`middleware.ts` + `lib/auth/middleware.ts`). `lib/auth/session.ts` derives
account context from the session and **provisions Account+app_user+owner
Membership on first sign-in** — account_id is never read from client input.
Server actions (`lib/auth/actions.ts`): email+password sign-in/up, magic link
(OTP), sign-out. `app/auth/callback` exchanges the code for a session.

**UI.** Auth route group (login / signup / check-email) with React 19
`useActionState` forms. Authenticated `(app)` shell: responsive sidebar
(Dashboard/Trucks/Items/Settings, +Admin if platform-admin), mobile drawer,
375px-first. Placeholder pages per section. Marketing landing at `/`.

**tRPC.** `lib/trpc/*` — context derives account from session;
`publicProcedure`, `protectedProcedure`, `adminProcedure`; `account.me`
query; fetch route at `/api/trpc/[trpc]`; client provider in root layout
(react-query + superjson).

**Stubs/seams.** Typed no-op adapters: `lib/email`, `lib/sms`; `lib/stripe`
PLANS catalog (limits ready for Phase 5 middleware); `lib/jurisdictions.ts`
(MN Twin Cities seed). Webhook routes return 501 with phase pointers.
`inngest/` documented-empty.

**Verification.** `npm run typecheck` ✅ · `npm run lint` ✅ ·
`npm run build` ✅ (17 routes, middleware bundled).

**Deferred to later phases:** real Supabase project + running migrations
(needs DATABASE_URL/keys); applying RLS against a live DB; Anthropic OCR
(Phase 3); Inngest jobs (Phase 3/4); Resend/Postmark/Twilio/Stripe real SDKs;
Sentry/PostHog; truck/item CRUD + dashboard status compute (Phase 2);
audit-log trigger (Phase 2).

**Assumptions made:** (1) "email + magic link only" = email/password **and**
passwordless magic link — implemented both. (2) First sign-in auto-creates a
personal account named from the email local-part; team invites come later.
(3) Server-side account provisioning in `session.ts` is acceptable (it is
provisioning, not a client mutation; all true data mutations still go through
tRPC). (4) `.claude/` is git-ignored (local memory).

### 2026-05-16 — Phase 1 live verification

- Supabase keys added; `npm run db:migrate` applied `0000` + `0001` to the
  live DB. Verified: 3 tables with RLS=true, 4 policies, helper fn present.
- Owner signed up **2 separate test accounts** via the dev server; data
  landed, auth + auto-provisioning + shell confirmed functional. UI polish
  deferred by owner ("will change UI later") — acceptable, structural only.
- Fixed Next workspace-root inference (a stray `package-lock.json` in the
  home dir): set `outputFileTracingRoot` in `next.config.ts`.
- Note: ad-hoc DB verification scripts may fail from this sandbox due to
  IPv6 egress restrictions; the Next dev server connects fine.

**Phase 1 signed off by owner. Cleared to start Phase 2.**

---

## Phase 2 — Trucks, Compliance Items, Dashboard, Audit — COMPLETE (2026-05-16)

Owner directive: I build everything; teaching walkthrough required →
`notes/02-phase-2-explained.md` (the what/why/how doc).

**Schema (`lib/db/schema.ts`, migration `0002`).** `truck`,
`compliance_item` (polymorphic via `item_type`), `audit_log` + 5 enums.
Money as integer cents, dates as `date`, soft-delete via `archived_at`,
self-FK `parent_item_id` reserved for Phase 6, indexes on account/expiry.

**Audit (`0003_audit_and_rls.sql`).** `permitkeep_audit()` AFTER
INSERT/UPDATE on truck + compliance_item writes old/new/actor;
`permitkeep_audit_block()` BEFORE UPDATE/DELETE on audit_log raises —
append-only for all roles incl. service. Actor passed via tx-local
`set_config('permitkeep.actor_id')`, wrapped in `withActor()`
(`lib/db/index.ts`). RLS + member-select policies for the 3 new tables.

**API.** `lib/trpc/routers/truck.ts` + `item.ts`: list/byId/create/update/
archive, account derived from session, ownership re-check before mutate,
archive-only, cross-account truck check. Registered in `root.ts`.
`lib/trpc/server.ts` server caller so RSCs reuse the same procedures.
`lib/validators.ts` (zod, dollars→cents at the edge, per-type reminder
defaults). `lib/status.ts` server-side RED/YELLOW/GREEN + urgency rank +
pure `classifyItem`. `lib/audit/index.ts` read-only history. `lib/format.ts`.

**UI.** trucks list/new/[id], items list/new/[id] (with live audit trail),
dashboard (status banner + urgency-sorted list). New primitives:
`ui/textarea`, `ui/badge`. Server reads / client mutations split.

**Verification.** typecheck ✅ · lint ✅ · build ✅ (21 routes). Migrations
applied to live Supabase. Audit trigger tested live (insert→logged w/ actor;
UPDATE & DELETE on audit_log both rejected), all in a rolled-back tx — 0
test rows left behind.

**Deviations:** none to the stack. Scope decisions logged in
`02-phase-2-explained.md` (reminder offsets as int[] until Phase 4; person/
business by name until Phase 8; "unack reminder >48h" YELLOW clause deferred
to Phase 4).

**Assumptions:** (1) `item_status` is a user-facing label distinct from the
date-derived urgency the dashboard computes. (2) Items not tied to an active
truck but expired are YELLOW (still a problem) — RED is reserved for the
brief's exact "expired on active truck" rule. (3) Reminder offsets entered as
a comma-separated list in the form for now.

**Phase 2 demoed and signed off by owner (2026-05-16). Cleared for Phase 3.**

---

## Phase 3 — File upload + Claude OCR — COMPLETE (2026-05-16)

Owner choices: live Anthropic (separate key recommended; owner added a key),
Inngest + manual fallback, storage bucket via migration. Teaching doc:
`notes/03-phase-3-explained.md`.

**Deps:** `@anthropic-ai/sdk@^0.96`, `inngest@^4.4` (both in-stack — no
deviation).

**Schema (migration `0004`).** `file_attachment`, `extraction_proposal`,
`extraction_cost` + enums `file_status`, `ocr_confidence`,
`proposal_status`; `audit_entity` extended with `file_attachment`. Cost in
integer micro-USD.

**Custom migration `0005`.** Private `documents` Storage bucket (no
permissive storage.objects policies — service-role + signed URLs only);
`file_attachment_audit` trigger reusing the Phase 2 audit function; RLS +
member-select policies for the 3 new tables.

**Pipeline.** `lib/extraction/schema.ts` (one Claude tool, zod re-validation,
defensive date/money parsers), `extract.ts` (vision call + token→micro-USD
cost), `run.ts` (download→extract→persist proposal+cost, sets manual-review
when expiration confidence low). Signed upload/read via `lib/storage.ts`
(service role). `lib/trpc/routers/file.ts`: createUploadUrl / confirmUploaded
/ runExtractionNow / latestProposal / signedReadUrl / applyProposal /
rejectProposal — account-scoped, ownership-checked, withActor-wrapped, apply
only fills found fields and never auto-"renews". Inngest client + job +
`/api/inngest`. Admin cost router + `/admin` dashboard (adminProcedure,
platform-admin only). UI: `documents-panel.tsx` on item detail (upload,
status, manual-review banner, proposal review w/ confidence chips,
apply/reject).

**Fix logged:** client component imported `server-only` `lib/storage` for the
bucket name → moved constant to client-safe `lib/constants.ts`. inngest v4
API differs from v3 (no `EventSchemas` export; `createFunction(options,
handler)` with `triggers` in options) — adjusted.

**Verification.** typecheck ✅ · lint ✅ · build ✅ (24 routes incl
`/api/inngest`). Migrations applied to live Supabase; verified: 3 tables
RLS=true, `audit_entity` has `file_attachment`, `file_attachment_audit`
trigger present, `documents` bucket present + private, 3 member-select
policies. (Live network was VPN-flaky again; succeeded with VPN off.)

**Deviations:** none to stack. Notable: storage has no permissive
object policies by design (signed-URL + service-role only) — documented in
`03-phase-3-explained.md`.

**Assumptions:** (1) overall `file.ocr_confidence` = the expiration-date
field's confidence (the decision-critical field). (2) Apply overwrites item
fields with found values, preserves fields the OCR didn't find. (3) Real
end-to-end OCR (actual Claude call on a real document) is exercised by the
owner in the demo — not auto-run here to avoid spending API credit on
synthetic input.

**Phase 3 demoed and signed off by owner (2026-05-16). Cleared for Phase 4.**

### Phase 3 — post-sign-off enhancements (2026-05-16, owner-requested)

Additive UX refinements after sign-off; no schema/stack change. Full detail
in `03-phase-3-explained.md` → "Post-sign-off enhancements".

- **Reject → Retry extraction** — rejected proposals now offer a Retry
  button (reuses `runExtractionNow`; each retry logs a cost row).
- **Reminder rework** — preset day chips + custom add + 🔔 use-case help
  text + soft non-blocking confirm ("catch") on empty/unadded reminders;
  reminder values now from React state; Type select made controlled.
- **Inline preview** — new `file.viewUrl` query; images render as
  thumbnails, PDFs in an embedded frame, Hide/Preview toggle.
- **UI spacing pass** — centered `max-w-5xl` content container + roomier
  padding in app shell; sidebar rhythm; all 9 app pages `space-y-8`; form
  gaps widened.

Verified typecheck ✅ / lint ✅. Bundled into the Phase 4 commit.

---

## Phase 4 — Reminders — COMPLETE (2026-05-16)

Owner choices: reuse item offsets as the schedule, Inngest cron + manual
fallback, Resend wired live (owner added `RESEND_API_KEY`). Teaching doc:
`notes/04-phase-4-explained.md`. Scope decisions in `00-decisions.md`.

**Schema (`0006`, `0007`).** `reminder_dispatch` + enums
`reminder_channel` / `reminder_kind` / `dispatch_status`; RLS member-select
policy. No audit trigger (dispatches are hard-deletable + recomputed).

**Logic.** `lib/reminders/schedule.ts` recomputes dispatch rows from the
item's own offsets + 45-day fee rule, inside the item write transaction
(create/update/archive in `item.ts`, and OCR Apply in `file.ts`); only
future sends, history preserved, no dupes. `lib/reminders/token.ts`
stateless HMAC acknowledge tokens (14-day expiry, `timingSafeEqual`).
`lib/reminders/dispatch.ts` send loop (owner email, skip archived, mark
sent/failed/skipped) + `acknowledgeDispatch`. `lib/email/index.ts` now
Resend-or-noop (lazy). `lib/reminders/email.ts` mobile-first email.

**Wiring.** Inngest `*/5 * * * *` cron (`inngest/functions/reminders.ts`,
registered in `/api/inngest`); tRPC `reminder.runDueNow` (same fn, account-
scoped) + `reminder.listForItem`. REST `/api/reminders/acknowledge` (token
→ ack; never auto — brief). `lib/status.ts` now applies the deferred
Phase 2 clause: sent + unacked > 48h on a live item → YELLOW.
UI: `components/features/reminders-panel.tsx` on the item page.

**Verification.** typecheck ✅ · lint ✅ · clean production `build` ✅
(25 routes incl `/api/reminders/acknowledge`). Migrations applied to live
Supabase and verified (`reminder_dispatch` RLS=true, 3 enums, policy).
Live network was VPN-flaky again mid-migrate; succeeded once direct.

**Env added:** `RESEND_API_KEY` (owner), `EMAIL_FROM` (defaulted),
`REMINDER_TOKEN_SECRET` (generated locally, value not echoed).

**Deferred:** SMS/voice channels + per-member routing → Phase 7–8 (schema
already has the `reminder_channel` enum). Real verified-domain sender for
production email (dev uses Resend's shared sender → only the Resend account
owner receives).

**This commit also carries:** the Phase 3 post-sign-off enhancements and
the Phase 3 sign-off note.

---

## Phase 5 — Payments — COMPLETE (2026-05-18)

Owner choices: I generate Stripe products via script, Stripe CLI + manual
fallback, hard-block on limit. Built live-but-resilient. Teaching:
`05-phase-5-explained.md`; code: `code/07-stripe-webhook-and-limits.md`.

**Schema (`0008`).** account + `stripe_subscription_id`, `plan_status`
enum (none/active/trialing/past_due/canceled), `plan_interval`,
`current_period_end`, `concierge_purchased_at`.

**Stripe layer.** `lib/stripe/client.ts` lazy SDK + `isStripeConfigured`.
`index.ts` lookup-key helpers + `tierFromLookupKey` + `effectiveTier`-feeding
PLANS. `prices.ts` cached `lookup_key`→id. `sync.ts` getOrCreateCustomer +
`applySubscription`/`clearSubscription` (one reconciler). `scripts/
stripe-setup.mjs` idempotent products/prices (`npm run stripe:setup`).

**API + webhook.** `billing` router: createCheckout / createConciergeCheckout
/ createPortal / syncFromStripe / status (owner-gated, resilient when
unconfigured). `/api/webhooks/stripe`: nodejs runtime, raw-body signature
verify, handles checkout.session.completed + subscription.created/updated/
deleted, 500-on-error for Stripe retries.

**Limits.** `lib/limits.ts` `assertWithinLimit` (+ `effectiveTier` floor);
`limitedProcedure(kind)` middleware in `trpc.ts`; applied to
`truck.create` / `item.create`. Counts non-archived only.

**UI.** `components/features/billing-panel.tsx` in Settings (plan badge,
monthly/yearly toggle, choose plan, manage billing, concierge, sync;
auto-syncs on return from Checkout). Settings page `force-dynamic` +
`<Suspense>` (useSearchParams).

**Verification.** typecheck ✅ · lint ✅ · clean build ✅. Migration `0008`
applied to live DB and verified (5 billing cols + `plan_status` enum).

**Deferred:** real Stripe keys/products are owner-supplied at demo
(`stripe:setup` + CLI). Concierge not auto-detected by manual sync (webhook
only) — logged in caveats. Team-seat enforcement (Fleet) beyond counts →
later.

**Ops note (2026-05-18):** owner hit `Cannot find the middleware module`
right after the Phase 5 verification build. Diagnosed as the transient
build→wipe→restart `.next` gap (dev log showed middleware compiling fine;
`/login` `/dashboard` 200 after a clean restart). Not a code defect.
Logged in `00-decisions.md` → Known caveats with the persistent-vs-transient
distinction + process to flag the build step beforehand.

**Phase 5 demoed and signed off by owner (2026-05-18). Cleared for
Phase 6 (Dependencies & commissaries).**

---

## Phase 6 — Dependencies & commissaries — COMPLETE (2026-05-18)

Owner choices: commissary = dedicated date columns; commissary lapse →
RED; parent→child inherits urgency. Teaching: `06-phase-6-explained.md` +
`code/08-cascade-status-engine.md`.

**Schema (`0009` + custom `0010`).** `commissary` table (name, address,
permit_expiration, contract_expiration); `truck.commissary_id` FK
(set-null); `audit_entity += commissary`; commissary audit trigger (reuses
generic fn) + RLS member-select.

**Validators/API.** `commissaryInput`; `truckInput.commissaryId`,
`itemInput.parentItemId` (+ shared `optionalUuid`). `commissary` tRPC
router (CRUD, account-scoped, withActor, archive-only).
`assertCommissaryInAccount` (truck) + `assertParentItem` (item, blocks
self-ref, `selfId` on update).

**Status engine.** Rewrote `computeAccountStatus` to 3 passes: base
urgency → bounded fixpoint parent→child propagation → count. Commissary
cascade via in-memory invert (commissaryId→truckNames); expired→RED,
≤30d→YELLOW; returns `commissaryAlerts` + per-item `blockedBy`.

**UI.** Commissaries list/new/[id] + form; sidebar nav (Warehouse);
truck-form commissary select; item-form parent select (excludes self);
dashboard "Commissary cascade" card + ⛔ blocked-by line; ArchiveButton
gained `commissary`.

**Verification.** typecheck ✅ · lint ✅ · clean build ✅. `0009`/`0010`
applied to live DB and verified (commissary table RLS=true,
`truck.commissary_id`, `audit_entity` has commissary, trigger + policy
present).

**Deferred:** deep parent cycle (A→B→A) prevention — only self-ref blocked,
fixpoint loop bounded so a cycle is harmless (Known caveats). Person/venue
entities → Phase 8.

**Phase 6 demoed and signed off by owner (2026-05-18). Cleared for
Phase 7 (Inbound email + SMS).**

---

## Phase 7 — Inbound email + SMS — COMPLETE (2026-05-18)

Owner choices: stub-resilient + dev simulators; built-in simulator route;
wire SMS channel now (stubbed). Teaching: `notes/07-phase-7-explained.md`.

**Schema (`0011`).** `account.sms_phone` (SMS recipient; null → SMS skipped).
No new enum (reminder_channel already had email|sms|voice from Phase 4).

**Inbound email.** `lib/inbound/classify.ts` (Claude tool, zod-validated,
neutral fallback if no key) + `process.ts` (store attachments via new
`uploadBytes`, match by identifier or jurisdiction+type, else create
`pending` DRAFT; renewal → `extraction_proposal` for confirm — never
auto-apply). `app/api/webhooks/postmark-inbound` real endpoint (slug
routing, `?secret=` gate, unknown→200).

**SMS.** `lib/sms/index.ts` Twilio-via-REST-or-noop adapter +
`isSmsConfigured`. `schedule.ts` adds an `sms` dispatch when
`PLANS[tier].sms` && `sms_phone` set (dedupe key now channel-aware).
`dispatch.ts` channel-branched send (SMS body = label + ack link + "Reply
OK"; no phone → skipped). `acknowledgeBySmsReply` + `/api/webhooks/
twilio-inbound` (empty TwiML). Only "OK" by the user acks — never auto.

**Simulators / UI.** `inbound` tRPC router (`simulateEmail`,
`simulateSmsOk`) calls the same cores as the webhooks; `account`
(`notificationSettings`, `setSmsPhone`); `components/features/
notifications-panel.tsx` in Settings (inbound address, phone, simulators).

**Verification.** typecheck ✅ · lint ✅ · clean build ✅ (routes incl
`/api/webhooks/postmark-inbound`, `/twilio-inbound`). `0011` applied to
live DB; `account.sms_phone` confirmed present.

**Deferred:** real Postmark/Twilio creds + A2P 10DLC (live on key add,
adapters unchanged); Twilio request-signature validation (added with live
creds); body-only renewals skip the proposal (needs a file FK); voice
channel → Phase 8.

**Phase 7 demoed and signed off by owner (2026-05-18). Cleared for
Phase 8 (Voice escalation + Pro features).**

---

## Phase 8 — Voice escalation + Pro features — COMPLETE (2026-05-18)

Owner choices: wire voice stubbed + simulator; full Venue/Person entities +
cascade; expired person cert → assigned active trucks RED. Teaching:
`notes/08-phase-8-explained.md`.

**Schema (`0012`, `0013`).** `venue`, `person`, `person_truck`;
`compliance_item.person_id`/`venue_id`; `audit_entity` += `venue`,`person`.
venue+person get the shared audit trigger; person_truck is a hard-deletable
join (no audit), RLS member-select on all three.

**Voice.** `lib/voice` Twilio-REST-or-noop adapter + `buildEscalationTwiml`
(`<Gather numDigits=1>`). `schedule.ts` adds one `voice` dispatch only at
the expiry 7-day mark when `PLANS[tier].voiceEscalation` && phone.
`dispatch.ts` voice branch: skip if ANY prior reminder for the item was
acknowledged (brief), else place call. `/api/webhooks/twilio-voice`
verifies the shared signed token → `acknowledgeDispatch` (press 1).

**Pro entities.** `venue`/`person` tRPC routers (CRUD, archive-only,
audited); `person` syncs `person_truck` assignments per save. `item`
router + validators carry `personId`/`venueId`. `lib/status.ts` adds the
person-cert cross-truck cascade (expired → RED, expiring → YELLOW) via a
`person_truck→person→truck` join over active trucks.

**UI.** venues + people CRUD pages, sidebar nav (MapPin/Users), item form
Person/Venue selects, person form truck-assignment checkboxes,
ArchiveButton extended, voice simulator in Settings.

**Verification.** typecheck ✅ · lint ✅ · clean build ✅. `0012`/`0013`
applied + verified (3 tables RLS, audit enum +venue/+person, both
triggers, item person_id/venue_id).

**Deferred:** real Twilio voice creds/A2P (live on key-add); no separate
venue cascade by design (expired COI already RED via item rule).

**Phase 8 demoed and signed off by owner (2026-05-19). Cleared for
Phase 9 (Admin & concierge tooling).**

### UI — brand-forward polish + dashboard redesign (2026-05-19)

Owner-requested global UI pass: warm terracotta brand palette + warm
neutrals/elevation tokens (`globals.css`), refined primitives (button/card/
input/textarea), app-shell rework (brand mark, active-nav pill, warm
sidebar). Then a dashboard redesign for clean info display: status hero with
metric tiles, "why this status" list, commissary cascade block, single
divided-row urgency list. Token/primitive pass committed `e7d24dd`;
dashboard redesign committed next. No logic/stack changes.

---

## Phase 9 — Admin & concierge tooling — COMPLETE (2026-05-19)

Owner choices: cross-tenant platform view; queue = manual-review files +
inbound drafts + concierge-onboarding accounts; read + resolve actions
(audited as the admin). Teaching doc: `notes/09-phase-9-explained.md`.

**Schema (`0014`).** `account.concierge_completed_at` (queue exit marker
for concierge onboarding). No new RLS — admin reads via service role,
gated by `adminProcedure` (is_platform_admin), never tenant membership.

**Admin router (`lib/trpc/routers/admin.ts`).** Cross-tenant:
`overview` (account/item counts, OCR accept-rate proxy = applied/(applied+
rejected), dispatch counts by status + recent failures), `conciergeQueue`
(3 feeds joined to account name), resolve mutations `markFileReviewed` /
`resolveProposal(apply|reject, reuses field-merge + recomputeDispatches)` /
`dismissDraft` / `markConciergeComplete` — all `withActor(adminUser)` so
interventions hit the append-only audit log. Phase 3 `extractionCostSummary`
kept.

**UI.** `app/(app)/admin/page.tsx` server cockpit (overview tiles,
accuracy, dispatch monitor, recent OCR) + `admin-queue.tsx` client island
for the actionable 3-section queue (server-fetch / client-act / refresh
pattern again).

**Verification.** typecheck ✅ · lint ✅ · clean production build ✅.
Migration `0014` applied to live DB and verified
(`concierge_completed_at` present).

**Deviations:** none. Accuracy is an explicitly-labelled *proxy*
(accept-rate), `null` until any proposal decided — logged in
`09-phase-9-explained.md` §2.

**Phase 9 demoed and signed off by owner (2026-05-19). Cleared for
Phase 10 (Inspection-prep digest) — the final phase.**

---

## Phase 10 — Inspection-prep digest — COMPLETE (2026-05-19)

Owner choices: Claude-generated + stored + admin-editable; monthly cron +
manual trigger; scoped by the account's jurisdictions. Teaching doc:
`notes/10-phase-10-explained.md`.

**Schema (`0015`, `0016`).** `jurisdiction_digest` — shared content, NO
account_id, unique `(jurisdiction, period)`. RLS = read-to-authenticated
(`USING (true)`); writes service/admin; no audit trigger (regenerated, not
a tenant record).

**Pipeline.** `lib/digest/generate.ts` idempotent per (jurisdiction,
period) — existing row kept (preserves admin edits / saves tokens), else
forced-tool Claude → constrained markdown, stored `published`; graceful
`skipped:no-key`. `resolve.ts` `accountJurisdictions` (UNION over
non-archived trucks+items) + `digestsForAccount`. `run.ts` generate-all →
email each account its set (owner email, Resend-or-noop). Inngest monthly
cron (`0 13 1 * *`, registered) + admin `generateAndSendDigests` call the
same path. `digest.forMyAccount` (protected) feeds the UI; admin
`digestList`/`editDigest` for ops.

**UI.** `/digest` read page + dashboard "Inspection prep · your area"
widget + sidebar nav + `/admin` "Generate & send now". Tiny dependency-free
markdown renderer. Advisory ("not legal advice") labelled in app + email.

**Verification.** typecheck ✅ · lint ✅ · clean production build ✅.
Migrations `0015`/`0016` applied to live DB and verified
(`jurisdiction_digest` RLS on, read policy present).

**Deviations:** none. Content is explicitly advisory (logged in
`10-phase-10-explained.md` §4).

---

## 🏁 Project complete — all 10 phases built (2026-05-19)

Phases 1–10 implemented, verified (typecheck/lint/clean build + live
migrations each), documented (per-phase explainer + code track), committed,
and owner-signed-off in sequence. The brief is fully realized.

**Live integrations:** Supabase (DB/Auth/Storage), Anthropic (OCR +
classification + digests), Resend (email), Stripe (billing).
**Stubbed behind adapters (live on key-add, dev simulators exist):**
Twilio SMS + Voice, Postmark inbound. Sentry/PostHog not wired (deferred —
see `00-decisions.md` caveats).

**Before production:** wire Twilio (A2P 10DLC in progress) + Postmark, a
verified Resend sending domain, Sentry/PostHog, real Stripe products via
`stripe:setup`, and run the full migration set on the production database.
All tracked in `00-decisions.md` → Known caveats. No surprises.

### Phase 4 — post-sign-off fix: catch-up reminders (2026-05-18)

Owner: "not receiving any emails." Diagnosed against live DB — the dispatch
was correctly scheduled 13:00 UTC, ~33 min in the future, so nothing was due
yet (not a bug). But it exposed a real flaw: recompute dropped any
already-past send-time, so late-added / soon-expiring items produced **zero**
reminders. Fix in `lib/reminders/schedule.ts`: clamp a past-but-still-
relevant send-time to `now` (catch-up); skip only if the item itself has
expired. typecheck ✅ / lint ✅. Also added `notes/README.md` (per-phase
index/TOC) and a "Known caveats" section in `00-decisions.md` (Resend dev
sender restriction; sent≠delivered; stub silently succeeds). Full detail:
`04-phase-4-explained.md` → "Post-sign-off fix".

**Phase 4 demoed and signed off by owner (2026-05-18). Cleared for Phase 5.**

---

### 2026-05-26 — Item jurisdiction made required (post-Phase 6)

Tightened `itemInput.jurisdiction` in [lib/validators.ts](../lib/validators.ts)
from `optionalTrimmed(120)` to a required `string().trim().min(1).max(120)`,
matching the existing `truckInput.jurisdiction` rule. Added `required` to the
form input in [components/features/item-form.tsx](../components/features/item-form.tsx)
for instant HTML5 feedback. **Did not** change `compliance_item.jurisdiction`
to `NOT NULL` in the DB — existing rows may hold NULL and that migration
would fail on a populated table without a backfill plan. Server-side Zod
validation catches all *new* writes; backfill + `NOT NULL` constraint is a
follow-up. Decision recorded in `00-decisions.md`. Rejected alternative:
forcing parent/child jurisdictions to match (would block the common
state-license → city-permit dependency).

---

### 2026-06-03 — Sentry wired (§5 observability, launch prep)

First half of §5 in `LAUNCH-CHECKLIST.md`. Error monitoring (server + client +
edge) now live via `@sentry/nextjs@10.56.0`. The driving constraint was the
brief's "never log permit/COI numbers or extracted document text" rule, so the
whole thing is configured PII-off by default with an explicit scrub on top.

**Files added (4 config files at project root + 1 helper + 1 global handler):**
- `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation-client.ts`
  — each `Sentry.init` is **DSN-gated** (`enabled: !!DSN`, so a no-op when the
  DSN is unset, e.g. local dev without keys), `sendDefaultPii: false`,
  `tracesSampleRate: 0.1`, and `beforeSend: scrubEvent`.
- `instrumentation.ts` — `register()` loads server/edge config per
  `NEXT_RUNTIME`; exports `onRequestError = Sentry.captureRequestError` (the
  App Router server-error hook). `instrumentation-client.ts` also exports
  `onRouterTransitionStart` for navigation instrumentation.
- `lib/observability/scrub.ts` — `scrubEvent()`, the never-log enforcer.
- `app/global-error.tsx` — reports React render errors via `captureException`.
- `next.config.ts` wrapped with `withSentryConfig` (org/project/authToken from
  env; source-map upload only fires when `SENTRY_AUTH_TOKEN` is set).

**Env:** `SENTRY_DSN` (server) added to `serverSchema`, `NEXT_PUBLIC_SENTRY_DSN`
to `publicSchema` + its `.parse()` call in `lib/env.ts`; both DSN vars +
`SENTRY_AUTH_TOKEN`/`SENTRY_ORG`/`SENTRY_PROJECT` in `.env.example` and Vercel
prod. Note: the config files read `process.env` directly (instrumentation loads
very early), not via the validated `serverEnv()`.

**Scrub posture (what it does / doesn't — detail in `00-decisions.md`):**
primary protection is `sendDefaultPii: false` (no bodies/cookies/IP/headers) +
Sentry's Node SDK not capturing local variable values. `scrubEvent` is
defense-in-depth: deletes `request.data`/`query_string`/`cookies` +
`authorization`/`cookie` headers, and strips a denylist of sensitive keys from
`event.extra`. **Known gaps:** does not scrub exception *messages* (rely on the
discipline "never interpolate doc text/permit numbers into an Error") nor
`event.contexts`. Acceptable for launch; hardening (regex over messages +
contexts sweep) is future work.

**Verification:** typecheck ✅ / lint ✅ / build ✅. Proved delivery with a
throwaway `app/api/sentry-test/route.ts` that did `captureException` + `flush`
and returned the eventId — got `{eventId, flushed:true, dsnPresent:true}`,
confirming the server SDK captures and transmits. Test routes deleted after.

**Gotcha worth remembering:** events go to the project that **owns the DSN** —
`SENTRY_PROJECT` only controls source-map upload, not event routing. We burned
time because an early DSN belonged to a stray `javascript-nextjs` project while
the dashboard was open on `vendguard`; events were landing fine, just invisible
in the wrong project view. Fix was swapping `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`
to the `vendguard` project's DSN. Also: client events can be silently eaten by
ad-blockers — server-side tests bypass that. Org/project are both `vendguard`.

**Still open in §5:** PostHog (same PII-exclusion rule), `/admin` + webhook-5xx
alerts, uptime checks on `/` and `/api/inngest`. See `LAUNCH-CHECKLIST.md`.

---

### 2026-06-05 — Alerting (§5 line 92), webhook-5xx half proven

In progress (`[~]`). The key realization driving this: **gracefully-handled
failures are invisible to Sentry.** Both targets on line 92 are swallowed —
a webhook handler error becomes a returned `500` (not a thrown exception, so
`onRequestError` never fires), and a dispatch failure is caught into a
`reminder_dispatch` row (`status: "failed"`). Sentry sees neither unless we
**explicitly** `captureException` at those swallow points. So the work is two
parts: (1) instrument the captures, (2) configure Sentry alert rules.

**Done + proven:** webhook-5xx capture pattern. Added `Sentry.captureException`
with `tags: { type: "webhook_5xx", webhook: "<name>" }` in the webhook `catch`
that returns 500. Verified end-to-end on `postmark-inbound`: a temporary
`throw` in the `try`, POST a valid payload → `HTTP 500` → event landed in
Sentry tagged `type:webhook_5xx`. PII-safe: tags carry only the webhook name,
no body/recipient. (Note: leave the **400** signature-rejection branches
un-instrumented — those are noise/attackers, not our bug.)

**Testing method worth remembering:** temporary deterministic `throw` in the
handler, reach it with a local request, confirm the tagged event, then revert
the throw. Two gotchas hit: (a) `postmark-inbound` short-circuits to `200
"Unknown inbox"` before the throw unless the recipient slug matches a real
account — use a real `{slug}@inbound.permitkeep.com`; (b) **Windows PowerShell
mangles double-quotes when passing JSON to native `curl.exe`** (interior `"`
stripped → server sees "Bad JSON" 400). Use `Invoke-RestMethod` + `ConvertTo-
Json`, a `-d "@file"`, or bash instead.

**Remaining for line 92:** same `captureException` in the other webhook
catches (stripe, twilio-*); the **dispatch-failure** capture in
`lib/reminders/dispatch.ts` catch (`type: dispatch_failure`, tags = UUIDs +
channel only, **never** `ownerEmail`/`smsPhone`); a threshold signal from the
`dispatch-reminders` cron (`if summary.failed > 0` → `captureMessage` +
`Sentry.flush(2000)` — serverless needs the flush); then the **Sentry alert
rules** (Issues alerts on `type:webhook_5xx`, and `type:dispatch_failure`
> N-in-1h to avoid noise) + a notification channel (email/Slack). The
how-to is captured in `code/11-observability-sentry.md` §gotchas + the
just-in-time teaching. Remember to remove any leftover `SABOTAGE` throws
(`git diff` before commit).

---

### 2026-06-06 — §5 observability finished (alerts + uptime)

§5 done except PostHog (postponed). Lines 89/92/93 → `[x]`.

**Dispatch-monitor alerting (line 92), built + tested.** The "alert on
`/admin` dispatch failures" is **not** on the admin page — that page only
*displays* failures (pull-based, needs a human looking). The alert is a
scheduled **watcher**: new `inngest/functions/dispatch-health.ts` cron
(`*/15`) calls `recentDispatchFailures(60)` from `lib/reminders/health.ts`
(same `status='failed'` rows the monitor shows, scoped to a 60-min window so
it fires on *new* pile-ups, not history) and `captureMessage` +
`Sentry.flush` when `>= FAILURE_THRESHOLD` (5). Registered in
`app/api/inngest/route.ts` (3rd cron). Webhook-5xx capture added to the
postmark catch (proven earlier). Tested via a throwaway route that ran the
exact logic and curl'd it: returned `{failures: 0, flushed: true}` →
**baseline 0 failed dispatches** (why `/admin` looked empty — healthy) and a
real Sentry event landed tagged `type:dispatch_health`. Test artifacts
cleaned up (throwaway route deleted, threshold restored 0→5, sabotage throw
removed, stale `.next` type cleared). Sentry **alert rules** for the tags
were configured directly in prod by the owner.

**Uptime (line 93).** Two **Sentry Uptime monitors** on `/` and
`/api/inngest` (the `/api/inngest` one would have caught the signing-key
`internal_server_error` 500 from the Inngest setup). Note: Sentry's uptime
feature was hard to find in the UI but is available on the plan. Thresholds:
fail after ~3 consecutive, recover after 1 — low-noise. Uptime is
**external** by necessity: a fully-down app can't report its own death, so
the "email on all errors" issue-alert is *not* a substitute.

**Admin UI nicety.** `/admin` dispatch monitor now shows an explicit
"No recent dispatch failures." green empty-state instead of rendering nothing
when healthy (`app/(app)/admin/page.tsx`).

**Still to ship:** the dispatch-health cron + webhook capture code is in the
working tree — **commit + deploy** so prod emits the events the (already-set)
alert rules listen for, then confirm `dispatch-health-alert` registers in the
Inngest prod dashboard with its `*/15` schedule.
