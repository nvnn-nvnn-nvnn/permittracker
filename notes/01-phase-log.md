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

---

### 2026-06-07 — Document-first OCR flow (§6 OCR, "scan to create")

New entry point: upload a permit → OCR → **pre-filled** create form → submit
makes the item with the doc already attached. Inverts the old item-first
order (create item → attach doc → OCR → apply onto item). Brief-compliant:
OCR only *suggests* defaults; the user reviews and submits (OCR never
auto-writes). **Verified end-to-end (2026-06-07):** scan → pre-filled form →
submit → item created with the document attached (shows in its Documents
panel). Gotcha that cost time: the Step 4 `item.create` input change
(`attachFileId`) wasn't picked up until the **dev server was restarted** —
until then the field was dropped from the payload and the file stayed orphan.
Restart after changing a tRPC procedure's input schema.

Files: new `app/(app)/items/new/scan/page.tsx` (RSC, fetches truck/person/
venue lists) + `components/features/scan-to-create.tsx` (client orchestrator).

**Step 1 — orphan upload + OCR.** Reuses the documents-panel upload sequence
(`createUploadUrl` → `uploadToSignedUrl` → `confirmUploaded`) but with
`complianceItemId: null` (the backend already allowed nullable — no change
needed). Then calls `runExtractionNow` **synchronously** instead of relying
on the Inngest event (async / no-op without the dev server) so the result is
deterministic. Captures the returned `fileId` in state.

**Step 2 — fetch proposal, gate the form.** `trpc.file.latestProposal.useQuery
({ fileId }, { enabled: !!fileId })` — `enabled` keeps it dormant until the
fileId exists. The form is rendered **only after the query settles**, because
`ItemForm` inputs are uncontrolled (`defaultValue` is read once at mount) — if
it mounts before the data lands, the prefill won't stick.

**Step 3 — prefill.** Extended `ItemForm` with an optional `initialValues`
object; each field default became `item?.X ?? initialValues?.X ?? ""` (edit
value wins; else OCR value; else blank — that's why create-mode auto-uses the
OCR data). `documentType` is a `text` column (typed `string`), so it needed a
runtime guard (`itemTypeValues.includes(...)`) to narrow into the strict
`initialType` union — type constraint vs runtime check. Fee needed cents→
dollars; `identifierNumber`→`identifier` name differs; dates go through
`dateInputValue` (handles the `??` chain + any shape).

**Step 4 — attach the file on create.** `item.create` input extended via
`itemInput.extend({ attachFileId: z.string().uuid().optional() })`. Mutation
splits it off (`const { attachFileId, ...itemData } = input`), and after the
insert returns `row`, links the orphan file in the **same transaction**:
`update fileAttachment set complianceItemId = row.id where id = attachFileId
AND accountId = ctx.account.accountId` — the account-scoped `where` is the
security boundary (can't attach another tenant's file). `attachFileId` is
optional, so the normal `/items/new` form (doesn't pass it) is unaffected.
Threaded: `scan-to-create` `fileId` → `ItemForm attachFileId` prop →
`create.mutate({ ...data, attachFileId })`.

**Remaining (optional, Step 5 lifecycle):** clean up abandoned orphan files
(uploaded + OCR'd but the user bailed before creating an item — they sit in
Storage with `complianceItemId = null`); decide whether to mark the proposal
`applied` once the item is created so it counts in the `/admin` accept-rate
metric. Neither blocks the flow working.

**Step 5 Part 1 — DONE (2026-06-07).** Orphan cleanup shipped. New
`deleteBytes(path)` in `lib/storage.ts` (Supabase `.remove`), `lib/files/
cleanup.ts` → `deleteAbandonedOrphans(olderThanHours = 24)` (query
`complianceItemId IS NULL AND createdAt < cutoff` via `isNull`+`lt`; per-file
try/catch, storage-delete-then-row, proposals cascade via the FK), and a daily
Inngest cron `orphan-file-cleanup` (`0 4 * * *`) registered in the serve()
list (5th function). NOTE: the file is misspelled `orphan-clearnup.ts` (import
matches, so it compiles — rename later). Part 2 (proposal `applied`
accounting) still skipped — cosmetic. Typechecks; not yet runtime-invoked.

**Entry-point UI (2026-06-07).** Folded scan + manual into one `/items/new`
page via `components/features/new-item-chooser.tsx` (client wrapper holding the
`scan | manual` toggle; the RSC page fetches truck/person/venue lists and
passes them down). Toggle = stacked selectable cards (scan is default). Built
out `ScanToCreate`'s idle state from a bare button → a dashed drop-zone (icon,
heading, "Choose a file", format/size hint), a numbered 3-step "how it works"
strip, and spinner progress states. The standalone `/items/new/scan` route is
now redundant — can be deleted. (Route since deleted; `new-item-chooser` now
forwards `initialType`/`initialSubtype` to the manual `ItemForm` branch only.)

### 2026-06-08 — Reminder email delivery live (resolves §1 Resend)

Reminders weren't arriving — root cause was Resend, not the pipeline (matches
the "Resend dev sender" caveat in `00-decisions.md`). Fix: verified the
`vendguard.app` sending domain in Resend and set `EMAIL_FROM=VendGuard
<reminders@vendguard.app>` (a real address on the verified domain, replacing
the default `onboarding@resend.dev` which only mails the Resend account owner).
Gotcha worth remembering: the email adapter + `serverEnv()` are **memoized**,
so changing `EMAIL_FROM`/`RESEND_API_KEY` needs a **dev-server restart** to
take effect. Diagnostic order that works: dev terminal (`[email:stub]` = no
key loaded), `/admin` dispatch status (sent/failed), Resend → Emails log
(delivered/bounced). Unblocks §6 Reminders QA. Also began the PermitKeep →
**VendGuard** rebrand (email/SMS/voice copy in `lib/reminders/`,
`lib/digest/email.ts`; `EMAIL_FROM`); Stripe product names + dashboard still
to do for a full rebrand.

### 2026-06-08 — Billing limits verified (§6 line 117)

Confirmed the cap block fires: on a Starter account, the 2nd truck (cap 1) is
rejected with the FORBIDDEN message rendered in the form's red error box. Logic
chain: `limitedProcedure` → `assertWithinLimit` throws `TRPCError(FORBIDDEN,
"…Upgrade in Settings → Billing…")` → React Query `onError` → `setError(msg)` →
`{error && <p role="alert">}`. Same pattern in truck-form + item-form. Caps:
Starter 1 truck / 15 items; Pro+ unlimited items. `effectiveTier` floors
lapsed/none accounts to Starter, so limits work pre-Stripe. **Follow-up (owner
will do):** the "upgrade prompt" is currently just the error *text* — no
clickable CTA. Improve later by detecting the FORBIDDEN code in `onError` and
rendering an actual Upgrade button/link to Settings → Billing.

### 2026-06-08 — Monthly digest verified (§6 line 121) + email gotchas

Digest renders + emails confirmed via `/admin` → "generate & send now"
(`admin.generateAndSendDigests` → `runMonthlyDigests`, same path as the
1st-of-month cron). Prereq: account needs items in a **seeded MN jurisdiction**
or `digestsForAccount` returns empty → `emailed: 0`. Digest content is
**Claude-authored, stored in `jurisdiction_digest`**, idempotent per
(jurisdiction, period) — re-runs reuse rows; only the email *shell*
(`lib/digest/email.ts`) is rebuilt per send. Two gotchas worth keeping:
(1) **Gmail spam** — new domain `vendguard.app` landed digest/reminder mail in
Gmail spam while Proton inboxed it and Resend showed "delivered" ("delivered" =
recipient server accepted, not inboxed). Fix = add a **DMARC** TXT record
(`_dmarc`, `v=DMARC1; p=none; rua=…`) on top of Resend's SPF/DKIM; Gmail's 2024
rules want all three. (2) **Sent email = frozen snapshot** — a brand/template
edit (PermitKeep→VendGuard) only shows on *new* sends; old inbox copies never
change. §6 now complete except the deferred SMS/voice/inbound items.

### 2026-06-10 — Stripe webhook signature-verification tests

Added `app/api/webhooks/stripe/route.test.ts` (Vitest) covering the
`constructEvent` gate in `app/api/webhooks/stripe/route.ts`. Drives the real
`POST` handler; signatures are generated **offline** with Stripe's own
`webhooks.generateTestHeaderString` (pure local HMAC — no network, no Stripe
API). 6 cases: valid sig → **200**; and → **400** for missing header, malformed
sig, tampered body (valid sig over a *different* payload), wrong secret, stale
timestamp (past the 5-min tolerance). Design choices worth remembering:
(1) the fixture event uses an **unhandled** type (`invoice.payment_succeeded`)
so a verified request falls through to `switch`'s `default` and returns 200
**without touching the DB or `getStripe()` API** — keeps the test hermetic and
purely about verification. (2) `STRIPE_SECRET_KEY`/`STRIPE_WEBHOOK_SECRET` are
set in `beforeAll` and the route is **dynamically imported after**, because
`serverEnv()` + the Stripe client memoize lazily. **Deferred:** the 503
"Billing not configured" path isn't covered here — `serverEnv()` memoization
means it belongs in a separate test file with fresh module state.

### 2026-06-13 — Account deletion / GDPR-CCPA erasure (IN PROGRESS)

Building hard account deletion (`lib/account/delete.ts`) for the launch
checklist §8 "data-deletion / account-closure" item. Admin-only first
(adminProcedure → `deleteAccount(accountId)`); self-serve owner flow comes
later. **Assumption locked: 1 user ↔ 1 account** (no multi-member case), so
deleting an account always deletes its single owner user too.

Key design facts discovered:
- **Cascade does ~90% of it.** Every tenant table FKs `account.id` with
  `onDelete: "cascade"`, so a single `DELETE FROM account` wipes trucks, items,
  commissaries, venues, people, files, proposals, costs, dispatches, membership.
  And the audit trigger is `AFTER INSERT OR UPDATE` only — **DELETE doesn't fire
  it**, so the cascade is neither blocked nor writes new audit rows.
- **`audit_log` is the ONE exception** — it has **no FK to account** (deliberate,
  so cascade can't erase history) and its `prior/new_value` JSONB embeds permit/
  COI numbers + `person.email`. So erasure needs an explicit privileged purge:
  `purge_account_audit(accountId)` — a `SECURITY DEFINER` SQL fn that out-ranks
  the append-only block trigger. **TODO: write that migration.**
- **Four things cascade can't reach:** (1) audit_log [above], (2) Supabase
  Storage bytes — must `deleteObjects(paths)` derived from `file_attachment.
  storage_path` BEFORE the cascade deletes those rows, (3) the Supabase auth
  identity — `getSupabaseAdmin().auth.admin.deleteUser()`, (4) Stripe — cancel
  the subscription but **keep the customer + invoices** (tax retention; an
  allowed GDPR/CCPA exception).

Routine ordering (external/reversible first, irreversible cascade last):
read account row + file paths → cancel Stripe → deleteObjects → **tx**{
purge_account_audit + DELETE account } → delete auth user + app_user row →
record + confirm. **Idempotency over atomicity:** can't transact across Stripe +
Storage + Supabase Auth + Postgres, so each external step is re-runnable
("already gone" swallowed, real failures captured to Sentry + rethrown to
abort before the cascade). Only the two Postgres ops share a transaction.

Prereqs added: extracted the service-role client to `lib/supabase/admin.ts`
(`getSupabaseAdmin`, reused by storage.ts) and a bulk `deleteObjects(paths)` in
`lib/storage.ts`. **Still TODO:** `purge_account_audit` migration, an
`account_deletion_log` table (proof-of-erasure, since audit_log for that account
is gone), the admin tRPC mutation, and `notes/data-deletion-process.md` runbook.

### 2026-06-13 — Account deletion: delete.ts + audit-purge migration DONE

`lib/account/delete.ts` implemented and tsc/eslint-clean. Final ordering is
**retry-safe**: read → Stripe cancel → `deleteObjects` → Supabase
`auth.admin.deleteUser` → **tx{ purge_account_audit; delete account (cascade);
delete app_user }**. The auth delete moved **before** the tx on purpose — the
account row is the retry sentinel (`if (!row) return`), so it must die last;
if it were deleted before the auth call, a failed auth delete could never be
retried (re-run would early-return) → orphaned login. All three external steps
swallow "already gone" (`stripe resource_missing`, `auth status 404`) and
Sentry-log+rethrow real failures so we never erase an account whose billing we
couldn't stop.

Migration `0018_purge_account_audit.sql` written + wired into drizzle journal
(idx 18) + chained 0018 snapshot. See `00-decisions.md` for the append-only
escape-hatch decision. **NOT yet applied to any DB** — run `npm run db:migrate`
(dev then prod) and re-run the Phase 2 append-only probe to confirm the guard
still rejects normal UPDATE/DELETE after the `CREATE OR REPLACE`. Also verify at
runtime that `auth.admin.deleteUser` returns `status: 404` for an already-gone
user (the 404 branch is assumed, type-checks but untested).

**Still TODO:** apply 0018; admin tRPC mutation (`adminProcedure` →
`deleteAccount`); `account_deletion_log` proof-of-erasure table; the
`notes/data-deletion-process.md` runbook; self-serve owner close-account flow.

### 2026-06-13 — Account deletion: admin mutation + erasure ledger DONE

tsc + eslint clean. Three pieces landed:
- **`account_deletion_log` table** (`lib/db/schema.ts`) — append-only proof-of-
  erasure ledger, **no FKs** (survives the cascade + outlives the owner, like
  `audit_log`); denormalized `accountName`/`accountSlug` so a row still means
  something after the account is gone. Columns: accountId, accountName,
  accountSlug, deletedByUserId (plain uuid), reason, createdAt.
- **`deleteAccount(accountId, { deletedByUserId, reason? })`** — signature
  changed to take who/why; writes the ledger row **inside the final tx**, atomic
  with the cascade (account deleted ⇒ proof row exists, guaranteed).
- **`admin.deleteAccountPermanently` mutation** — `adminProcedure` (platform-
  admin, cross-tenant). Input `{ accountId, confirmSlug, reason? }`. **Echo-
  confirm guard**: fetches the account, throws BAD_REQUEST unless
  `confirmSlug === account.slug` (stops fat-fingering the wrong tenant); passes
  `ctx.account.userId` as deletedByUserId. **No `withActor`** here (unlike sibling
  admin mutations) — the audit log for this account is being erased, and
  deleteAccount manages its own tx + external calls. Named `…Permanently` to
  signal irreversibility. Removed a broken earlier `deleteAccount` stub (wrong
  `itemId` input) that was failing tsc.

**REQUIRED before it runs:** the table isn't in the DB yet — run
`npm run db:generate` (emits `0019_*` CREATE TABLE + snapshot, diffed against the
0018 snapshot which has no new tables) then `npm run db:migrate` (applies 0018
purge-fn + 0019 table). NOTE: 0018 was hand-written (pure SQL functions/triggers,
which drizzle's diff can't model); 0019 is a real table so it goes through
`db:generate` — don't hand-write it.

**Still TODO:** run generate+migrate; `notes/data-deletion-process.md` runbook
(blocked on 4 policy values: SLA, intake email, who's authorized, ledger
retention); self-serve owner close-account flow.

### 2026-06-13 — Account deletion: admin UI + migrations applied, TESTED ✅

Migrations generated + applied (0018 purge-fn/escape-hatch, 0019
`account_deletion_log` table). Admin UI shipped + verified working end-to-end:
- **`components/features/account-danger-zone.tsx`** — "Danger zone" card at the
  bottom of `/admin` (platform-admin only; page already `notFound()`s
  non-admins). Account dropdown → type-the-slug echo-confirm (button disabled
  until it matches) → `window.confirm()` → `admin.deleteAccountPermanently`.
  Optional reason flows to the ledger.
- **`admin.listAccounts`** query (id/name/slug, cap 200) feeds the picker.
- Wired into `app/(app)/admin/page.tsx` via the `Promise.all` fetch.

Three protection layers confirmed: admin-role gate (page + adminProcedure),
slug echo-confirm (client disable + server BAD_REQUEST), browser confirm dialog.
Account-deletion feature is now functionally complete and tested.

**Still TODO (non-blocking for the feature itself):**
`notes/data-deletion-process.md` runbook (blocked on 4 policy values: SLA,
intake email, who's authorized, ledger retention) — this is the checklist §8
"define the path" deliverable; and the self-serve owner close-account flow.

### 2026-06-13 — Data-deletion runbook written; checklist §8 DONE

`notes/data-deletion-process.md` written. Policy locked: **30-day SLA**,
**platform-admin-only** execution, **3-year** `account_deletion_log` retention.
Intake email is a **placeholder** (`raysarchive@proton.me`) that must be
reconciled with the Privacy Policy's `privacy@vendguard.app` before launch.
Runbook covers scope/legal basis, intake, identity verification, what's
deleted vs retained (+basis: ledger 3yr, Stripe invoices for tax, backups age
out), processor propagation, the /admin Danger-zone execution steps,
confirmation, and record-keeping. Launch Checklist §8 data-deletion item ticked
`[x]`. Account-deletion epic now fully complete (logic + UI + migrations +
tested + documented). Remaining: self-serve owner close-account flow (later
phase) and the broad UI/UX polish pass.

### 2026-06-14 — Truck-centric UI/UX redesign (dashboard, trucks, items)

Major front-end reorg toward a parent→children (truck→items) model. **No schema
change** — `compliance_item.holderTruckId` + `itemType` already existed; this was
all presentation. tsc + eslint clean throughout.

New shared + components:
- `lib/item-display.ts` — single source for the 5 item types' order/label/icon
  (Stamp/ClipboardCheck/BadgeCheck/ShieldCheck/Truck), reused everywhere.
- `truck-items.tsx` — a truck's items in collapsible **type folders**; **ALL 5
  categories always listed** even when empty (empty = collapsed, dim, with a
  prefilled `/items/new?truck=&type=` Add link).
- `truck-rollup.tsx` — per-truck status list (worst-of-its-items), reused on the
  dashboard "By truck" section AND the `/trucks` list.
- `truck-staff-items.tsx` + new `truck.staffItems` tRPC query — staff certs that
  cascade onto a truck via `person_truck`.
- `items-by-type.tsx` — `/items` is now a **multi-column folder grid** by type;
  all 5 columns always shown; headers link to the category subpage.
- `app/(app)/items/category/[type]/page.tsx` — NEW per-category subpage (focused
  list for one type). Validates type → notFound; can't collide with `/items/[id]`.
- `dashboard-urgent-table.tsx` — the dashboard centerpiece: a **"Needs attention"
  table** (expired / ≤30d / fee-due-soon, most-urgent first), soft red/amber row
  wash, ring-halo status dots, type pills, responsive (Expires col hides <md).
- `commissary-cascade.tsx` — extracted + professionalized the dashboard's
  commissary block (header bar, count pill, linked rows, severity tints, clearer
  "Permit expired / Contract due in Nd" badges).

Pages reworked: `trucks/[id]` is now the compliance hub (status header → type
folders → staff certs → edit form demoted into a collapsible "Truck details");
`trucks` list shows compliance status per truck; `dashboard` restructured to
status hero → Needs-attention table → commissary cascade → by-truck → digest
(removed the redundant "Why this status" bullet list).

Design language settled after iteration (user: "less vibe coded" then "not too
amateur / too close together" then "more pretty"): flat **flex column-of-rows**
layout, comfortable `px-5 py-4` rows, `gap-6` between item columns, status =
color (R/Y/G) only, type = icon; soft severity row tints + ring-halo dots for
polish. **All views verified by tsc+eslint only — NOT yet eyeballed in a running
app.** Open follow-ups: wire `?truck=` prefill on the new-item page (currently
only `type` is read); the parked "shared/account-wide items" decision (user
chose the no-schema 'applies to all trucks' section — not yet built); optionally
extend the table polish to the item detail page + dashboard status hero.

### 2026-06-14 — Plan-limit warnings → upgrade prompt (billing cap UX)

Closed the billing-limits follow-up logged at "2026-06-08 — Billing limits
verified" (the cap error was raw red text with no CTA). Now truck-form + item-form
detect the limit case and render a professional upgrade prompt instead.
- `lib/limit-error.ts` — `isLimitError()` = `TRPCClientError` with `data.code ===
  "FORBIDDEN"` (the only FORBIDDEN these create flows throw, from
  `assertWithinLimit`).
- `components/features/limit-notice.tsx` — branded panel (primary tint + Sparkles),
  "You've reached your plan limit" + the cap detail + guidance (upgrade or
  archive), "Upgrade plan" button → `/settings`. Strips the server message's
  redundant "Upgrade in Settings…" tail.
- Both forms now hold `{ message, isLimit }`; `isLimit` → `<LimitNotice>`, else the
  plain red box for genuine errors. Decided AGAINST a modal — inline-at-the-form
  keeps entered data and shows the prompt where the action failed.
tsc + eslint clean. UI/UX redesign pass considered done; user pushing to
production. NOTE: redesign + this prompt still verified statically only — a live
click-through (esp. exceeding a cap, and the dashboard table with real expiring
items) is the outstanding manual check before/at deploy.

### 2026-06-14/15 — Marketing site + gold rebrand + Web3Forms contact (APP COMPLETE)

Built the public marketing frontend (separate from the app, wrapped by the
`(marketing)` route group) and finished the brand pass. tsc + eslint clean;
`npm run build` compiles (see `/_document` caveat below).

**Marketing site** (`app/(marketing)/`):
- `components/marketing/site-header.tsx` — sticky auth-aware nav (logo, Features/
  How it works/Pricing/About/Contact, Sign in + Get started or Dashboard).
- `components/marketing/site-footer.tsx` — multi-column (Product/Company/Legal) +
  "not legal advice" disclaimer; wired into `(marketing)/layout.tsx`.
- Pages: **landing** (`page.tsx`) — hero, trust strip, 6-feature grid, 3-step how-
  it-works, photo quote, photo CTA; **pricing** (3 tiers), **about**, **contact**.
- Food-truck photos (`app/assets/foodtruck-{1..4}.jpg`) via `next/image` +
  `placeholder="blur"`: landing hero/quote/CTA, about why/CTA, pricing + contact
  headers (image bg + dark overlay + light text), and **foodtruck-1 as the auth
  (signup/login) frosted background** in `(auth)/layout.tsx`.

**Gold rebrand** (`app/globals.css`): swapped the terracotta `--brand`/`--primary`/
`--ring` to the **logo gold #FCB017**. CRITICAL: white text on gold is unreadable,
so `--brand-foreground` flipped to dark (gold buttons now have dark text). Gold is
also a poor TEXT color on white, so added a deeper **`--brand-ink`** token
(oklch 0.52 light / #fcb017 dark) and bulk-swapped all `text-primary` → `text-brand-ink`
(perl lookahead preserved `text-primary-foreground`). So: fills = bright gold +
dark text; links/icons = readable deep gold.

**Depth pass**: soft shadows + hover elevation on landing feature tiles/step cards
and the items folders (items-by-type columns, truck-items). Card-based surfaces
already had `shadow-soft`. Also tightened marketing whitespace (py-20/24 → py-12/16).

**Contact form → Web3Forms** (`components/marketing/contact-form.tsx`): real client-
side POST to `api.web3forms.com/submit`, no backend. States (sending/success/error),
honeypot, form reset. KEY GOTCHA solved: the access key MUST be `NEXT_PUBLIC_*` to be
readable in a client component — user's original `WEB3FORMS_PUBLIC_KEY` (no prefix)
was invisible to the browser. Added `NEXT_PUBLIC_WEB3FORMS_KEY` to `.env.local`
(+ `.env.example`); the old `WEB3FORMS_PUBLIC_KEY` line is now redundant.

**Still required before/at deploy (NOT code):**
- Add `NEXT_PUBLIC_WEB3FORMS_KEY` to **Vercel** env (else live form is keyless).
- `rm -rf .next` before `npm run dev` (build/dev cache collision causes the
  `segment-explorer`/`__webpack_modules__` 500s seen in dev).
- The `/_document` build unhandledRejection is a **pre-existing Sentry
  instrumentation quirk** (not the UI work); exits 0, Vercel deploys through it —
  confirm with a preview deploy.
- Still open from earlier: Resend domain verify, Supabase PITR, independent
  security review; and the redesign/marketing remain verified statically — a live
  click-through is the final manual check.

### 2026-06-15 — Contact form: AV false-positive → server-route architecture

**Symptom:** `components/marketing/contact-form.tsx` kept getting **deleted/locked
by antivirus** seconds after every write (ls saw it, then "Permission denied" /
"No such file"; sibling files in the same folder were fine) → dev threw
`Module not found: @/components/marketing/contact-form` and `/contact` 500'd.

**Root cause:** the first version was the textbook Web3Forms client snippet —
browser JS that collects name/email/message and POSTs them to
`api.web3forms.com` with an `access_key`. That is **byte-for-byte the pattern
phishing kits use to exfiltrate stolen form data** (phishers abuse Web3Forms), so
Windows Defender has a signature for it and quarantines the file. A legit false
positive. Folder exclusion alone wouldn't fix it (needs "Allow" on the active
detection).

**Fix (chosen "do whatever is best"):** split the Web3Forms call OFF the client.
- `components/marketing/contact-form.tsx` — now **benign**: posts same-origin JSON
  to `/api/contact`. No provider URL, no key → nothing for AV to flag. Survives.
- `app/api/contact/route.ts` (NEW, runtime nodejs) — does the Web3Forms POST
  server-side, reads the key from **env** (`WEB3FORMS_ACCESS_KEY` ??
  `WEB3FORMS_PUBLIC_KEY` ?? `NEXT_PUBLIC_WEB3FORMS_KEY`) so there's no literal key
  in source → signature broken, file survives. Adds server-side validation +
  honeypot (botcheck → silent 200). Both files confirmed persisting; tsc+eslint clean.
- Net: form works (client → /api/contact → Web3Forms), key is now **server-only**
  (more secure than the earlier NEXT_PUBLIC client-exposed key).

**Contact page UI** (`app/(marketing)/contact/page.tsx`): the three contact
"bubbles" are now a **row** across the top (3-up desktop / stacked mobile, soft
shadow), with the **form below in a centered column** — was side-by-side.

**Deploy notes:** (1) restart dev (`rm -rf .next && npm run dev`) to pick up the
new route + clear the build/dev cache 500s; (2) add a Web3Forms key var to
**Vercel** (e.g. `WEB3FORMS_PUBLIC_KEY`) for prod; (3) `NEXT_PUBLIC_WEB3FORMS_KEY`
in `.env.local` is now redundant (client no longer calls Web3Forms) — safe to
delete. Earlier `WEB3FORMS_PUBLIC_KEY`/`NEXT_PUBLIC_*` env merge bug (no trailing
newline) was fixed; both on their own lines now.
