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
the dashboard was open on `cartledger`; events were landing fine, just invisible
in the wrong project view. Fix was swapping `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN`
to the `cartledger` project's DSN. Also: client events can be silently eaten by
ad-blockers — server-side tests bypass that. Org/project are both `cartledger`.

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
`cartledger.app` sending domain in Resend and set `EMAIL_FROM=CartLedger
<reminders@cartledger.app>` (a real address on the verified domain, replacing
the default `onboarding@resend.dev` which only mails the Resend account owner).
Gotcha worth remembering: the email adapter + `serverEnv()` are **memoized**,
so changing `EMAIL_FROM`/`RESEND_API_KEY` needs a **dev-server restart** to
take effect. Diagnostic order that works: dev terminal (`[email:stub]` = no
key loaded), `/admin` dispatch status (sent/failed), Resend → Emails log
(delivered/bounced). Unblocks §6 Reminders QA. Also began the PermitKeep →
**CartLedger** rebrand (email/SMS/voice copy in `lib/reminders/`,
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
(1) **Gmail spam** — new domain `cartledger.app` landed digest/reminder mail in
Gmail spam while Proton inboxed it and Resend showed "delivered" ("delivered" =
recipient server accepted, not inboxed). Fix = add a **DMARC** TXT record
(`_dmarc`, `v=DMARC1; p=none; rua=…`) on top of Resend's SPF/DKIM; Gmail's 2024
rules want all three. (2) **Sent email = frozen snapshot** — a brand/template
edit (PermitKeep→CartLedger) only shows on *new* sends; old inbox copies never
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
reconciled with the Privacy Policy's `privacy@cartledger.app` before launch.
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

### 2026-06-15 — Legal pages finalized + effective date

Filled every bracketed placeholder in `components/legal/privacy-policy.tsx` and
`terms-of-service.tsx`. **Effective / Last-updated → May 15, 2026** (both, incl.
the Terms' closing "effective as of" line). Standardized the contact email to
`raysarchive@proton.me` (Terms had a stale `legal@cartledger.app`; now matches the
Privacy + contact pages). Removed the `[Your Business Address]` line from both
(email-only) rather than invent an address. Privacy retention → "within 90 days";
Terms liability cap → "twelve (12) months"; Terms governing law → **Minnesota**
with a concrete exclusive-venue/jurisdiction clause added.
- Then **removed the shared draft/placeholder banner** from `legal-page.tsx`
  (lived in the `LegalPage` shell → gone from both pages) per user; also dropped
  the stale "drop the banner" comment.
- **Judgment calls flagged to user:** governing law kept as Minnesota (draft's
  existing choice — confirm if registered elsewhere); no physical address listed
  (add back if one is legally required). These are NOT attorney-reviewed.

### 2026-06-15 — Auth: show-password toggle + confirm password

- New reusable `components/ui/password-input.tsx` — `<PasswordInput>`, a drop-in
  for `<Input type="password">` with an eye/eye-off toggle (lucide `Eye`/`EyeOff`,
  `aria-label`/`aria-pressed`, `tabIndex={-1}` so it stays out of tab order).
- Applied across **all** password fields in `components/features/auth-forms.tsx`:
  sign-in, sign-up, and both reset-password fields.
- **Sign-up now has a "Confirm password" field** (`name="confirm"`), and
  `signUpWithPassword` in `lib/auth/actions.ts` validates it matches (mirrors the
  existing `resetPassword` check) → "Passwords do not match." Confirm is enforced
  server-side, not just UI.

### 2026-06-15 — Dashboard first-run onboarding walkthrough

New `components/features/dashboard-onboarding.tsx`, rendered from
`app/(app)/dashboard/page.tsx` via early return when
`trucks.length === 0 && result.items.length === 0` (brand-new account = nothing
tracked). 3-step vertical walkthrough enforcing the **truck-first model**:
(1) Create your first truck — the ONLY live CTA (primary, → `/trucks/new`,
ring-highlighted); (2) Add compliance items; (3) Let CartLedger watch the dates.
Steps 2–3 are intentionally non-actionable (muted) because items can't exist
without a parent truck — visually funnels the new user to create the truck first.
All new/changed files pass tsc + eslint (pre-existing `token.test.ts` tsc error
is unrelated).

### 2026-06-15 — Location made vague (de-Minnesota'd the product surface)

Per request, scrubbed all user-facing references to Minnesota / Twin Cities /
specific metros so the product reads location-agnostic:
- `lib/jurisdictions.ts`: `MN_JURISDICTIONS` → `DEFAULT_JURISDICTIONS`, values now
  generic (State/City/County Health Dept, State Dept. of Agriculture, City Dept.
  of Safety & Inspections, County Environmental Health). Updated all 4 importers
  (truck-form, item-form, digest/run, the `Jurisdiction` type).
- Genericized: truck-form jurisdiction placeholder, the notifications-panel demo
  notice, and the AI extraction schema example → "City Health Department".
- Terms §13 governing law: "State of Minnesota" → "the state in which CartLedger
  is established" (venue clause kept, no named state).
- **Left alone (flagged to user):** internal notes — `00-decisions.md` still
  records "Launch metro: Twin Cities, MN" as a binding decision, plus phase logs
  / README. Did not rewrite the decision record or append-only history.
- Heads-up: `runMonthlyDigests` now iterates the generic jurisdiction names, so
  any digests seeded under the old MN names won't match (fine in beta).

### 2026-06-15 — Settings notifications: prefs UI + persisted email toggle

- **Commented out** the `NotificationsPanel` (SMS/voice + forward-to-inbox
  simulators) in `app/(app)/settings/page.tsx` — Postmark isn't wired yet. Import
  + JSX both commented; component file kept intact to restore later. Also left a
  `// TODO` to collect the user's ZIP later (explicitly NOT implemented now).
- **New `components/features/notification-preferences.tsx`**: a "how we reach you"
  block. Email channel (default on, toggleable); SMS channel **locked** (lock icon
  in the checkbox + `Beta · Pro` badge + note — can't enable yet). Status line
  reflects active channels. Custom checkbox + lightweight modal built by hand (no
  Radix dialog/checkbox dep — none installed, CLAUDE.md says ask first).
- **Warning modal** (`alertdialog`, Esc/backdrop close): intercepts turning email
  OFF while SMS is locked off (⇒ zero channels) — "Turn off all reminders?" with
  Keep (default) / Turn off anyway. Confirming flips status line to a red
  all-off warning.
- **Backend (persisted, per follow-up request):**
  - Schema: `account.notifyEmail` boolean NOT NULL DEFAULT true. Migration
    `supabase/migrations/0020_graceful_micromacro.sql` (drizzle-kit generate).
    **Needs `npm run db:migrate` to apply** — not run here (no DB creds).
  - Router `account.ts`: `notificationSettings` now returns `notifyEmail`; new
    `setEmailNotifications({ enabled })` mutation.
  - Component now reads/writes via tRPC with optimistic cache update.
  - `lib/reminders/dispatch.ts`: email branch skips with "Email reminders
    disabled by user" when `notifyEmail` is false. SMS/voice + transactional/auth
    emails unaffected. **Digest emails (`digest/run.ts`) are NOT gated** (separate
    content stream) — open question whether to gate by same toggle.
- **Dashboard warning** (`app/(app)/dashboard/page.tsx`): fetches
  `account.notificationSettings`; renders a red "Email reminders are turned off"
  banner (→ Settings) when `notifyEmail` is false. All changed files pass
  tsc + eslint.

### 2026-06-15 — Vendor event pipeline (vertical slice)

New feature: track prospective events + application status. See `00-decisions.md`
for the scope/why and the venue-vs-event modeling call.

- **Schema** (`lib/db/schema.ts`): `event` table + `eventStatusEnum`
  (interested→applied→waitlisted→accepted→confirmed→rejected→withdrawn→attended).
  Fields: name, status, optional `venueId`, location, `eventDate`,
  `applicationDeadline` (date mode), `applicationUrl`, `feeAmountCents` (int
  cents), notes; account-scoped, archive-only. `Event`/`EventStatus` types.
- **Migrations:** `0021_regular_hedge_knight.sql` (table, drizzle-gen) +
  hand-authored `0022_event_audit_rls.sql` (audit trigger + RLS member-select,
  same as venue/person). Journal `meta/_journal.json` updated with the 0022 entry
  (idx 22) so `drizzle-kit migrate` applies it. **Run `npm run db:migrate`** to
  apply 0020/0021/0022.
- **Validators** (`lib/validators.ts`): `eventInput` + `eventStatusValues`. Fee
  entered as dollars client-side → converted to cents.
- **Shared meta** (`lib/events.ts`): `EVENT_STATUS_META` (label + badge variant +
  `open` pipeline flag) and `EVENT_STATUS_ORDER`.
- **Router** (`lib/trpc/routers/event.ts`, registered in `root.ts`): list, byId,
  create, update, **setStatus**, archive — account-scoped, `withActor`-audited,
  tenant-guarded (`assertOwned`).
- **UI:** nav "Events" (`CalendarCheck`, after Venues); list grouped into the
  status pipeline (`events/page.tsx`); new (`events/new`) + detail/edit
  (`events/[id]`) via `event-form.tsx`; quick `event-status-select.tsx` on detail;
  `archive-button.tsx` extended with `kind="event"`. Detail surfaces a venue COI
  callout once accepted/confirmed. Dashboard gets an "Events pipeline" card
  (open count + soonest application deadlines, urgency-colored).
- **Tone pass (pre-prod polish):** events list re-skinned to the canonical
  list pattern (`TruckRollup`): single `Card overflow-hidden p-0` + `divide-y`
  rows, full-row `Link` with `hover:bg-accent/40`, `ChevronRight`, status `Badge`
  group headers, deadline urgency colors matching the dashboard; empty state
  matches the centered card + brand-ink CTA. Form `Field` matches `venue-form`.
  All new/changed files pass tsc + eslint.

---

## Operations pillar — Slice 1: Square sales sync + weekly P&L (2026-06-25)

Second product pillar ("Stay profitable") begins — see `00-decisions.md`
(2026-06-25) for the why (Reddit/PH "just use a spreadsheet" pricing backlash)
and the slice sequencing. This slice is the thinnest wedge: connect Square,
roll daily sales into a weekly P&L. Inventory/purchasing/expenses/QuickBooks
are later slices.

- **No new dependency.** The Square adapter uses raw REST via `fetch` + Bearer
  token (same posture as the Twilio SMS adapter), so the `square` SDK is *not*
  installed — this sidesteps the "ask before adding deps" gate. Confirmed the
  REST approach matches `lib/sms/index.ts`.
- **Adapter** (`lib/square/index.ts`): `getSquareAdapter()` returns a real REST
  adapter when `SQUARE_ACCESS_TOKEN` is set (GET /v2/locations, POST
  /v2/orders/search w/ cursor pagination, aggregated per closed-at day), else a
  **deterministic stub** that fabricates plausible weekend-weighted daily sales
  so the dashboard demos with zero creds. `isSquareConfigured()` mirrors
  `isSmsConfigured()`. Env: `SQUARE_ACCESS_TOKEN?`, `SQUARE_ENVIRONMENT`
  (sandbox|production, default sandbox), `SQUARE_LOCATION_ID?` added to
  `lib/env.ts`. QuickBooks intentionally NOT wired (Slice 4).
- **Schema** (`lib/db/schema.ts`): enum `sales_source` (square|manual);
  `square_connection` (one row/account, unique on account_id — merchant/location
  + last_synced; NO OAuth token persisted in Slice 1) and `sales_day`
  (one row per account+source+business_date; money in integer cents;
  net = gross − refunds). Both are RLS member-select; like `reminder_dispatch`,
  `sales_day` is synced/recomputable so it is **not audited**, and
  `square_connection` is config (like account billing cols) so also not audited.
- **Migrations:** `0023_sleepy_starbolt.sql` (tables, drizzle-gen) +
  hand-authored `0024_ops_rls.sql` (ENABLE RLS + member-select policies).
  Journal updated with idx 24. **Run `npm run db:migrate`** to apply 0023/0024.
- **Sync** (`lib/square/sync.ts`): `syncSquareSales(accountId, {days=90})`
  pulls daily sales and **upserts** `sales_day` (onConflict account+source+date
  → idempotent re-sync) and upserts the `square_connection` row + last_synced.
  Writes via the service connection (`getDb`), no `withActor` (un-audited).
  Plus `disconnectSquare` (keeps history) and `getSquareConnection`.
- **Weekly P&L** (`lib/ops/pnl.ts`): `weeklyPnl(accountId, weeks=8)` buckets
  `sales_day` into Mon–Sun weeks, computes net/gross/refunds/tax/tips/discounts,
  avg ticket, and week-over-week net change. Expense side (cogs/overhead/
  estimated profit) returned as **null** ("not tracked yet") — never fake a
  profit number; those land in Slices 2–3.
- **Router** (`lib/trpc/routers/ops.ts`, registered in `root.ts`): `connection`
  (query), `sync` (mutation, wraps adapter errors as BAD_GATEWAY), `disconnect`
  (mutation), `weeklyPnl` (query). All account-scoped from session.
- **UI:** nav "Operations" (`TrendingUp`, right after Dashboard) in
  `app-shell.tsx`; page `app/(app)/operations/page.tsx` (server component) —
  connection card with `components/features/square-sync.tsx` (client; Connect /
  Sync now / Disconnect via tRPC mutations + `router.refresh()`), latest-week
  hero tiles, and a weekly P&L table with WoW pill. Empty state when no sales.
- **Verify:** `npm run typecheck` clean for all new/changed files (one
  pre-existing unrelated error in `lib/reminders/token.test.ts`).
- **Deferred / pending:** plan-gating ops behind Pro+ and the **free-tier =
  1 truck** pricing change are both still pending (separate from this slice);
  full Square OAuth + encrypted token storage; expense/COGS slices; a Square
  webhook for incremental sync (Slice 1 is pull-only).

---

## Pricing: card-required 14-day free trial (2026-06-25)

Decision reversed (see `00-decisions.md`): **no free tier**; the product is now
all-paid + a 14-day free trial. Built the trial first (before Slice 2), as
confirmed. Reuses Phase 5 billing almost entirely — `plan_status` already has
`trialing` and `effectiveTier()` already grants the full tier while trialing,
so a trial user gets full access with **zero new gating code**.

- **Card-required** flavor chosen (converts better; billing already wired).
  Implemented via Stripe Checkout, not a bespoke trial system.
- **Schema:** `account.trial_started_at` (`0025_elite_albert_cleary.sql`) — a
  durable, set-once trial-eligibility marker so cancel→resubscribe can't farm a
  fresh 14-day trial. Trial END during a trial is `current_period_end`.
- **`lib/stripe/index.ts`:** `TRIAL_PERIOD_DAYS = 14`.
- **`createCheckout` (`billing.ts`):** when eligible (`plan_status==='none'` &&
  `trial_started_at` null && no `stripe_subscription_id`), adds
  `subscription_data.trial_period_days=14` +
  `trial_settings.end_behavior.missing_payment_method='cancel'`, and
  `payment_method_collection: 'always'` (card required even during trial). Non-
  eligible accounts (already trialed/subscribed) check out with no trial.
  `billing.status` now returns `trialEligible` + `trialDays`.
- **Reconciler (`applySubscription`):** stamps `trial_started_at` once, the
  first time it sees `trialing`, via `coalesce(trial_started_at, now())` — works
  for both the webhook and the manual "Sync from Stripe" path.
- **UI:** billing panel shows a trial banner when eligible ("Start with a
  14-day free trial — card required, cancel anytime"), CTA copy becomes "Start
  14-day trial", and the header shows "free trial — N days left (billing starts
  …)" while trialing. Marketing `pricing/page.tsx` copy updated ("Start 14-day
  free trial" / removed "Start free" free-tier language).
- **Verify:** typecheck clean for all changed files (lone pre-existing
  `token.test.ts` error unrelated); eslint clean.
- **Pending:** `PLANS` re-pricing + feature flags + ops/AI plan-gating still to
  come; at trial expiry with a failing card Stripe cancels → `effectiveTier()`
  floors to starter (existing behavior). Local trial testing needs the Stripe
  CLI running (same as all Phase 5 webhook flows).
- **Marketing copy swept:** removed remaining "Start free" / "Free to start"
  free-tier language (home hero + bottom CTA, about CTA, pricing) → "Start free
  trial" / "14-day free trial".

---

## Operations Slice 2a — Inventory (ingredients) (2026-06-25)

Slice 2 (inventory + recipe usage + purchasing) is being delivered as **2a/2b/
2c** so each ships end-to-end rather than half-built. 2a = inventory, the
foundation recipes (COGS) and purchasing both build on.

- **Schema** (`lib/db/schema.ts`): `ingredient` — account-scoped, archive-only,
  RLS member-select, **not** wired to compliance `audit_log` (operational data,
  same posture as the rest of the ops pillar). Quantities are
  `doublePrecision` (fractional units like 1.5 lb are normal — NOT currency);
  money stays integer cents (`unit_cost_cents`). Fields: name, category, unit
  (text, e.g. lb/each/case), unit_cost_cents, on_hand_qty, par_level (reorder
  threshold; null = no low-stock alerts), reorder_to_qty, supplier_name, notes.
- **Migrations:** `0026_chunky_tattoo.sql` (table, drizzle-gen) + hand-authored
  `0027_ingredient_rls.sql` (ENABLE RLS + member-select). Journal updated
  (idx 27). **Run `npm run db:migrate`** to apply 0026/0027.
- **Validator** (`lib/validators.ts`): `ingredientInput` (+ `ingredientUnits`
  datalist suggestions). Cost entered in dollars → cents at the router edge;
  quantities coerced; par/reorder optional.
- **Router** (`lib/trpc/routers/inventory.ts`, registered in `root.ts` as
  `inventory`): list, byId, **summary** (count + total on-hand value cents +
  low-stock count via SQL `filter`), create, update, **adjustStock**
  (set | delta, floored at 0), archive. Plain `getDb()` (not audited);
  tenant-guarded via `assertOwned`.
- **UI:** nav "Inventory" (`Boxes`, after Operations); list page
  (`app/(app)/inventory/page.tsx`) with summary tiles + low-stock `Badge` rows;
  `inventory/new` + `inventory/[id]` (edit + archive) via
  `components/features/ingredient-form.tsx`; `ArchiveButton` extended with
  `kind="ingredient"` (explicit branch, removed the silent person fallthrough
  risk). Operations page gains an Inventory snapshot card (value + low-stock,
  links to /inventory).
- **Verify:** `npm run typecheck` clean (lone pre-existing `token.test.ts`
  error remains, unrelated); eslint clean on all new/changed files.
- **Next (2b):** recipes + recipe_ingredient join → per-recipe COGS & margin,
  which is what makes the weekly P&L's profit line real. Then 2c purchasing
  list (seed a draft order from below-par ingredients; receiving bumps on-hand).
  Deferred: an inventory movement ledger (`inventory_txn`) and auto
  recipe-usage depletion from Square line items.

---

## Operations Slice 2b — Recipes + ingredient usage (COGS/margin) (2026-06-25)

Menu items priced against ingredient cost. This delivers per-recipe COGS &
margin (menu engineering); wiring COGS into the *weekly* P&L still needs
sales→recipe attribution (deferred — see below).

- **Schema** (`lib/db/schema.ts`): `recipe` (name, category, sell_price_cents,
  notes) + `recipe_ingredient` join (recipe_id, ingredient_id, qty
  doublePrecision; unique per recipe+ingredient). Account-scoped, archive-only
  (recipe), RLS member-select, not audited. `recipe_ingredient` is a hard-
  deletable join replaced wholesale on each save (like `person_truck`).
- **Migrations:** `0028_wild_felicia_hardy.sql` (tables) + hand-authored
  `0029_recipe_rls.sql` (RLS for both). Journal idx 29. **Run
  `npm run db:migrate`** to apply 0028/0029.
- **Validator** (`lib/validators.ts`): `recipeInput` + `recipeLineInput`
  (sellPrice dollars→cents at router; lines array, max 100). NOTE: handler uses
  the parsed *output* type — `RecipeInput` (`z.input`) has `qty: unknown`
  because of `z.coerce`, so helpers type lines as `{ingredientId; qty:number}[]`.
- **Router** (`lib/trpc/routers/recipe.ts`, registered as `recipe`): list
  (recipes + COGS via `leftJoin`+`groupBy(recipe.id)` aggregate + lineCount),
  byId (recipe + priced lines + COGS), create/update (transactional; lines
  normalized = de-duped by ingredient + zero-qty dropped; `assertIngredientsOwned`
  guards cross-tenant ingredient refs; update replaces the BOM wholesale),
  archive. Plain `getDb()` (not audited).
- **UI:** nav "Recipes" (`ChefHat`, after Inventory); list page with per-item
  margin % (green/red); `recipes/new` + `recipes/[id]` via
  `components/features/recipe-form.tsx` — a client form with a **dynamic
  ingredient-line builder** (select + qty rows, add/remove) and a **live
  COGS / sell price / margin preview** computed from the inventory list. Reuses
  `inventory.list` for the picker (no new endpoint). `ArchiveButton` extended
  with `kind="recipe"`.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts` error); eslint
  clean (removed an unused `CardContent` import).
- **Deferred:** weekly-P&L COGS requires mapping Square line items → recipes
  (sales attribution); until then the P&L profit line stays `null`. Also
  deferred: inventory depletion on sale, and a movement ledger.
- **Next (2c):** purchasing list — seed a draft order from below-par
  ingredients; receiving bumps on-hand.

---

## Operations Slice 2c — Purchasing (reorder lists / POs) (2026-06-25)

Completes Slice 2. A purchase order the manager builds (or auto-seeds from
low stock), moved draft → ordered → received; **receiving adds the ordered
quantities back to inventory**.

- **Schema** (`lib/db/schema.ts`): enum `purchase_order_status`
  (draft/ordered/received/canceled); `purchase_order` (supplier_name, status,
  notes, ordered_at, received_at, archived_at) + `purchase_order_item`
  (qty doublePrecision, unit_cost_cents **snapshot at order time**, unique per
  order+ingredient). Account-scoped, archive-only, RLS member-select, not
  audited. Items replaced wholesale while editable.
- **Migrations:** `0030_stormy_wild_pack.sql` (tables) + hand-authored
  `0031_purchasing_rls.sql`. Journal idx 31. **Run `npm run db:migrate`** to
  apply 0030/0031.
- **Validator** (`lib/validators.ts`): `purchaseOrderInput` + `purchaseLineInput`
  (qty + per-line unitCost dollars→cents).
- **Router** (`lib/trpc/routers/purchasing.ts`, registered as `purchasing`):
  list (orders + itemCount + totalCents aggregate), byId (priced lines),
  create/update (transactional; `update` blocked once received), **setStatus**
  (receiving bumps `ingredient.on_hand_qty` per item in the same transaction,
  guarded by `received_at` so it's **idempotent** — receiving can't double-add),
  **createFromLowStock** (seeds a draft from every below-par ingredient, qty =
  reorderTo/par − onHand), archive.
- **UI:** nav "Purchasing" (`ShoppingCart`, after Recipes); list page with
  status badges + a **"Generate from low stock"** button
  (`purchasing-actions.tsx`); `purchasing/new` + `purchasing/[id]` via
  `purchase-order-form.tsx` (dynamic line builder, prefills unit cost from the
  ingredient, live order total). Detail page shows status-transition buttons
  (Mark ordered / Receive / Cancel / Reopen) and switches to a **read-only
  summary once received**. `ArchiveButton` extended with `kind="purchaseOrder"`.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean
  (removed an unused import).

**Slice 2 (inventory + recipes + purchasing) is complete.** The ops loop now
exists end-to-end: stock ingredients → build recipes (COGS/margin) → reorder
below-par stock → receive to replenish. Still deferred: sales→recipe
attribution (to put COGS into the weekly P&L), inventory depletion on sale, a
movement ledger, Square webhook for incremental sync, plan-gating + repricing,
Slice 3 (expenses), Slice 4 (QuickBooks), automated checklist, AI assistant.

---

## Operations Slice 3 — Overhead expense ledger + P&L expense side (2026-06-25)

A barebones bookkeeping ledger (the QuickBooks fallback) — and the first **real
expense side** in the weekly P&L, so it finally shows profit instead of "—".

- **Schema** (`lib/db/schema.ts`): `expense` — description, category (free text
  + `expenseCategories` datalist), amount_cents, spent_on (date → drives the
  P&L week it lands in), vendor_name, notes. Account-scoped, archive-only, RLS
  member-select, not audited.
- **Migrations:** `0032_chemical_invaders.sql` (table) + hand-authored
  `0033_expense_rls.sql`. Journal idx 33. **Run `npm run db:migrate`** to apply
  0032/0033.
- **Validator** (`lib/validators.ts`): `expenseInput` (amount dollars→cents;
  spentOn coerced date; defaults date to today in the form).
- **Router** (`lib/trpc/routers/expenses.ts`, registered as `expenses`): list,
  byId, summary (total + count over last N days), create, update, archive.
- **Weekly P&L wired** (`lib/ops/pnl.ts`): now also pulls expenses since the
  window start and **buckets them by spent_on into the same Mon–Sun weeks**
  (weeks with only expenses now appear too). New `WeeklyPnl` fields:
  `overheadCents` (real) and `operatingProfitCents = netSales − overhead`.
  `cogsCents` stays **null** (still needs sales→recipe attribution), so the
  profit column is labelled **"Op. profit*"** with a footnote that food cost
  isn't included yet — staying honest about what the number means.
- **UI:** nav "Expenses" (`Receipt`, after Purchasing); list page (30-day total
  + dated rows w/ category badge), `expenses/new` + `expenses/[id]` via
  `expense-form.tsx`; `ArchiveButton` extended with `kind="expense"`. Operations
  page: P&L table swapped Refunds/Avg-ticket columns for **Overhead + Op.
  profit** (red when negative), and added an **Overhead snapshot card** (30-day
  total) next to the inventory card.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean.
- **Next candidates:** sales→recipe attribution (the last piece for true COGS
  in the P&L), the automated checklist, plan-gating + repricing, Slice 4
  (QuickBooks), AI assistant.

---

## P&L food cost — step 1: purchases-based actual food cost (2026-06-25)

Decided approach (see the conversation): finish the P&L's profit line with
**actual food cost = supplier purchases received**, not theoretical per-recipe
COGS. Rationale: reuses purchasing data we already have, no dependency on Square
line-item quality or a recipe-mapping chore, and matches the food-cost % KPI
operators actually track. Theoretical/attribution COGS is a later layer.

- **`lib/ops/pnl.ts`:** now also pulls **received** purchase orders since the
  window start, totals each PO (`Σ qty × unit_cost_cents`), and buckets by
  `receivedAt` into the same Mon–Sun weeks. `WeeklyPnl` gains `foodCostCents`
  (replaces the old null `cogsCents`); `operatingProfitCents = net − foodCost −
  overhead`. Added `WeeklyPnlResult.totals` = trailing sums over the returned
  window incl. **`foodCostPct`** (food ÷ net) — the headline KPI. `hasData`
  now also true when only purchases exist.
- **Operations page:** P&L table columns now Week · Net sales · **Food cost** ·
  Overhead · **Profit** (red when negative); added a **trailing-totals KPI
  card** (Net sales / Food cost % / Overhead / Operating profit over last Nw);
  footnote explains food cost = received supplier purchases (lumpy → watch the
  trailing %), overhead = expenses, true per-recipe COGS later.
- **Honest framing kept:** "food cost" is actual supplier spend and is lumpy
  week-to-week (bulk buys), so the **trailing food-cost %** is presented as the
  number to watch, not the weekly figure.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean.
- **Next (accuracy, step 2):** one-tap inventory snapshots → true actual COGS =
  opening + purchases − closing (smooths lumpiness, exposes shrink/variance).
  Step 3 (parallel): Square line-item ingestion + recipe mapping → theoretical
  COGS and theoretical-vs-actual variance.

---

## Tier A roadmap chosen (2026-06-25)

After completing the ops loop, owner reviewed a broad feature wishlist. Decided
**Tier A only** — features that deepen the "operations brain on top of Square +
QuickBooks" — and explicitly **rejected Tier B** (offline sales capture, online
ordering, pickup/order management, menu editing/availability, prep-timing/KDS,
condiment-station workflow) because those make us a POS/ordering competitor,
contradicting the logged "don't build a POS" decision and re-opening the
"why not just use Square" objection. Tier A sequence: (1) Square line-item
ingestion → item-level reports; (2) menu-simplification suggestions; (3)
inventory counts/snapshots → true actual COGS; (4) QuickBooks sync; (5) truck
location / service-window status; (6) health-dept change log for truck mods
(compliance pillar); (7) enforce staff roles on ops screens + plan-gating.

## Tier A step 1 — Square line-item ingestion + item sales report (2026-06-25)

- **Adapter** (`lib/square/index.ts`): new `listItemSales()` on `SquareAdapter`
  + `SquareItemSalesDay` type. Stub fabricates a 5-item demo menu with per-day
  quantities; real impl aggregates Square order **line_items** by (day, name).
- **Schema:** `sales_item_day` (account, source, business_date, item_name,
  square_item_id?, qty_sold, gross_sales_cents; unique per
  account+source+date+item). Synced/recomputable, RLS member-select, not
  audited. Migrations `0034_silent_sleepwalker.sql` + hand-authored
  `0035_sales_item_rls.sql` (journal idx 35). **Run `npm run db:migrate`.**
- **Sync** (`lib/square/sync.ts`): pulls item sales alongside daily sales and
  upserts `sales_item_day` (idempotent, onConflict per item/day).
- **Router** (`ops.itemSales`): aggregates per item over last N days
  (best-sellers first by gross).
- **UI:** Operations page gains a **"Top items · last 30 days"** table (item,
  units, sales). Footnote points to the next step (recipe matching → per-item
  margin + menu-simplification).
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean.
- **Next (Tier A step 2):** match item names → recipes for per-item margin and
  menu-simplification suggestions.

---

## Tier A step 2 — Menu-simplification suggestions (2026-06-25)

Classic menu engineering: matches Square item sales to recipe cost and sorts
items into **Star / Plowhorse / Puzzle / Dog** with a plain-English action each.

- **Analysis lib** (`lib/ops/menu.ts`): `menuAnalysis(accountId, days)` pulls
  item sales (`sales_item_day`) + recipes-with-COGS, matches by **normalized
  item name** (`trim().toLowerCase()` == recipe name), computes per-unit margin
  + total contribution, then classifies vs. the **average units & average
  margin** across matched items. Returns matched (classified), unmatched (sold
  but no recipe), and the thresholds.
- **Router:** `ops.menuAnalysis({days})`.
- **UI:** new page `app/(app)/operations/menu/page.tsx` — classified list with
  class badge (star=green, plowhorse=yellow, puzzle=outline, dog=red), per-item
  margin/units/price/cost + recommendation, an "sold but no recipe" section
  (prompts to name a recipe to match), and a legend. Linked from the Operations
  "Top items" section ("Menu analysis →").
- **Matching caveat (by design):** name-based exact match. Items whose POS name
  ≠ recipe name show as unmatched until the user aligns names; an explicit
  mapping table is deferred.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean.
- **Next (Tier A step 3):** inventory counts/snapshots → true actual COGS.

---

## Tier A step 3 — Inventory counts → actual food cost (2026-06-25)

Periodic physical counts → **actual food cost = opening + purchases − closing**
(captures waste/shrink, unlike the P&L's purchases proxy).

- **Schema:** `inventory_count` (countedOn, total_value_cents snapshot, note) +
  `inventory_count_line` (counted_qty, unit_cost_cents snapshot per ingredient).
  Account-scoped, RLS member-select, not audited; lines cascade with the count.
  Migrations `0036_mute_richard_fisk.sql` + hand-authored
  `0037_inventory_count_rls.sql` (journal idx 37). **Run `npm run db:migrate`.**
- **Validator:** `inventoryCountInput` (countedOn, note, lines[]).
- **Router** (`inventory.*`): `listCounts`, `countById` (with priced lines),
  **`createCount`** — validates ownership, snapshots current unit costs,
  computes total value, inserts count + lines, and **reconciles each
  ingredient's on_hand_qty to the counted figure** (transactional).
- **Actual COGS** (`ops.actualCogs`): takes the two most recent counts +
  received purchases between them → opening + purchases − closing. Returns
  `{available:false}` until there are ≥2 counts.
- **UI:** count form (`inventory-count-form.tsx`) prefilled from current
  on-hand with a live counted-value total; `/inventory/counts` (list + actual-
  COGS card), `/inventory/counts/new`, `/inventory/counts/[id]`; "Counts" link
  on the Inventory page; an **Actual food cost** card on the Operations page.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean.
- **Next (Tier A step 4):** QuickBooks sync (Slice 4) — or step 5 truck status.

---

## Tier A step 4 — QuickBooks export (Slice 4) (2026-06-25)

Working deliverable = a **QuickBooks-importable CSV** of sales + expenses (no
creds needed). Live two-way QBO sync is OAuth2 + entity mapping and can't be
exercised without a dev app, so it's **stubbed** (same posture as Square).

- **Adapter** (`lib/quickbooks/index.ts`): `QuickBooksAdapter.pushTransactions`
  + `getQuickBooksAdapter()` (no-op stub for now) + `isQuickBooksConfigured()`
  (checks `QUICKBOOKS_ACCESS_TOKEN` + `QUICKBOOKS_REALM_ID`). Env vars added to
  `lib/env.ts`. Real REST push is future work (commented).
- **Export builder** (`lib/ops/export.ts`): `buildFinancialCsv(accountId, days)`
  → 4-column CSV (Date, Description, Category, Amount) — sales net as positive
  income, expenses as negative — the shape QBO imports as bank transactions.
  CSV-escapes fields; money as `(cents/100).toFixed(2)`.
- **Router:** `ops.financialExport({days})` (returns filename + csv + counts),
  `ops.quickbooksStatus` (liveSyncConfigured flag).
- **UI:** page `app/(app)/operations/export/page.tsx` with a connected/export-
  only badge; client `quickbooks-export.tsx` fetches the CSV via
  `utils.ops.financialExport.fetch` and triggers a Blob download (30/90/365-day
  range). Linked from the Operations header ("Export to QuickBooks →").
- **No new tables/migrations** — pure read/export over sales_day + expense.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean.
- **Next (Tier A step 5):** truck location / service-window status.

---

## Tier A step 5 — Truck service status (location / window) (2026-06-25)

Per-truck "are we serving / where" status — a food-truck-specific, self-
contained feature (no integrations).

- **Schema:** enum `service_status` (open/closed) + `truck_status` (1:1 with
  truck via unique truck_id; service_status, current_location, service_window,
  status_note, updated_at). **Separate table on purpose** — status changes
  often, and `truck` is audited; keeping it separate avoids spamming the
  compliance audit_log with location pings. RLS member-select, not audited.
  Migrations `0038_amused_spectrum.sql` + hand-authored
  `0039_truck_status_rls.sql` (journal idx 39). **Run `npm run db:migrate`.**
- **Validator:** `truckStatusInput`.
- **Router** (`truck.*`, plain `getDb` — not audited): `statusList` (all
  non-archived trucks left-joined to their status) + `setStatus` (upsert on
  truck_id, ownership-checked).
- **UI:** `truck-status-control.tsx` (open/closed toggle + location + window +
  note) on the truck detail page; a **Service status** card on the Operations
  page listing each truck with an open/closed badge + location, linking to the
  truck.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean.
- **Deferred:** a public/customer-facing "where's the truck" page (this step is
  operator-facing only).
- **Next (Tier A step 6):** health-dept change log for truck modifications.

---

## Tier A step 6 — Truck modification / health-dept change log (2026-06-25)

Compliance-pillar feature: a dated record of equipment/layout/menu changes that
may trigger re-inspection — proof for the health department + a re-inspection
status flag.

- **Schema:** enum `reinspection_status` (not_required/pending/scheduled/
  cleared) + `truck_modification` (truck_id, description, category, changed_on,
  reinspection_status, reported_to_health_dept, notes). Account-scoped,
  archive-only, RLS member-select. Migrations `0040_curvy_domino.sql` +
  hand-authored `0041_truck_modification_rls.sql` (journal idx 41). **Run
  `npm run db:migrate`.**
- **Decision (logged):** it's itself an append-style log, so it is NOT wired to
  the formal compliance `audit_log` trigger (which would need an audit-enum +
  trigger migration) — consistent with how this session treated the new tables.
- **Validator:** `truckModificationInput` (+ `reinspectionStatusValues`,
  `modificationCategories`). Meta in `lib/modifications.ts` (`REINSPECTION_META`
  → label + badge variant; pending = red, scheduled = yellow, cleared = green).
- **Router** (`modification.*`, plain `getDb`): list (joins truck name; filter
  by truckId / includeArchived), byId, create, update, archive — truck
  ownership checked.
- **UI:** nav "Truck log" (`Wrench`, after Trucks); list page with status
  badges; `modifications/new` (+ `?truck=` prefill) + `modifications/[id]` via
  `modification-form.tsx` (truck select, category datalist, date, re-inspection
  select, reported-to-health-dept checkbox). "Log change" link added to the
  truck detail header. `ArchiveButton` extended with `kind="modification"`.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean.
- **Next (Tier A step 7):** enforce staff roles on ops screens + plan-gating
  (the last Tier A step), then `PLANS` re-pricing/feature-flags.

---

## Tier A step 7 — Plan-gating + staff roles on Operations (2026-06-25)

The last Tier A step. Locks the Operations pillar to entitled plans and makes
`viewer` members read-only — both enforced in **one** tRPC middleware.

- **`PLANS.operations` flag** (`lib/stripe`): starter=false, **pro/fleet=true**
  (default split; one-line change to re-tier). This is the concrete encoding of
  the still-flexible pricing decision.
- **`lib/limits.ts`:** `operationsEnabled(tier,status)`,
  `accountHasOperations(accountId)` (async; **open when Stripe is unconfigured**
  so dev/preview isn't locked out — billing-resilient), `assertOperationsAccess`
  (throws FORBIDDEN with an upgrade message).
- **`opsProcedure`** (`lib/trpc/trpc.ts`): one middleware that (a) asserts plan
  entitlement and (b) blocks **mutations** for `viewer` role (uses the tRPC
  `type` to tell reads from writes — so queries stay open to viewers, writes
  don't). Applied by swapping `protectedProcedure → opsProcedure` across all
  five ops routers (ops, inventory, recipe, purchasing, expenses).
- **UI:** `AppShell` gets `operationsEnabled` (from the app layout via
  `accountHasOperations`) and **hides the 5 ops nav items** when off; the
  Operations page renders an **upgrade gate** instead of erroring when the plan
  doesn't include it.
- **Known gap (minor):** the deep ops pages (inventory/recipes/…) aren't
  individually wrapped in the upgrade gate — they're hidden from nav and the
  server `opsProcedure` blocks their data, so a non-entitled user who types the
  URL directly hits a FORBIDDEN error rather than a pretty screen. Acceptable;
  wrap them in the gate later if needed.
- **Pricing still owner-pending:** the exact tier→price mapping (and whether
  Starter should include any ops) is a pricing call; the flag makes it trivial.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean.

## Nav reorg — grouped sidebar sections (2026-06-25)

The flat ~15-item sidebar is now grouped under section headers (chose grouped
nav over multi-dashboard — clarity with no added navigation depth; the two
existing hubs Dashboard + Operations remain the "overviews").

- `app-shell.tsx`: nav is now `NavGroup[]` (label + items) rendered with small
  uppercase section headers. Groups: **Overview** (Dashboard), **Finances**
  (Sales & P&L [was "Operations"], Expenses), **Inventory** (Inventory, Recipes,
  Purchasing), **Compliance** (Items, Inspection prep, Commissaries, Venues,
  People, Events), **Trucks** (Trucks, Truck log), **Account** (Settings, Admin).
  The "/operations" item was relabeled **"Sales & P&L"** (href unchanged).
- Plan-gating preserved: ops items are filtered per-group and any group left
  empty is dropped — so for a non-ops plan the **Finances + Inventory groups
  disappear entirely**. Nav made scrollable (`flex-1 overflow-y-auto`).
- Compliance is the flexible bucket (Commissaries/Venues/People/Events parked
  there as compliance-supporting entities); easy to re-bucket.
- Verify: typecheck clean (lone pre-existing `token.test.ts`); eslint clean.

## P&L granularity (day/week/month) + line chart (2026-06-25)

- **`lib/ops/pnl.ts`:** generalized `weeklyPnl` → **`periodPnl(accountId,
  granularity, periods)`** with `granularity` = day | week | month. Buckets
  sales/expenses/purchases by period start (day = the date, week = Monday,
  month = 1st); `defaultPeriods` = 14 days / 8 weeks / 12 months. `WeeklyPnl`
  → **`PnlPeriod`** (now `periodStart`/`periodEnd` + a `label`); `weeks` →
  `periods`; result carries `granularity`.
- **Router:** `ops.weeklyPnl` → **`ops.pnl({ granularity, periods? })`**.
- **Chart (no dependency):** `components/features/ops-line-chart.tsx` — a
  server-rendered inline-SVG line chart (scales to include 0 so losses read
  against a baseline; `stroke-current` + Tailwind color classes; legend + peak
  + first/mid/last labels). Plots **Net sales** + **Operating profit**.
- **Operations page:** added a **Daily / Weekly / Monthly toggle** (URL
  `?g=`, server-driven — no client fetch), the line chart above the P&L table,
  and made the hero / totals / WoW / table all period-generic (uses `label` +
  `noun`). Heading "Weekly P&L" → "P&L".
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean;
  earlier full `next build` passed (this is a refactor of those routes).

## v1.1 — Auto-depletion: sales → recipe → inventory usage (2026-06-25)

The "bridge" that makes inventory automatic: Square item sales deplete
ingredient on-hand via recipes, and record a per-day usage ledger (theoretical
food cost). Previously inventory only moved via manual edit / receiving / counts.

- **Schema:** `inventory_usage` (account, source, business_date, ingredient_id,
  qty_used, cost_cents; unique per account+source+date+ingredient). The ledger
  is also the "usage report" source. Migrations `0042_kind_shinko_yamashiro.sql`
  + hand-authored `0043_inventory_usage_rls.sql` (journal idx 43). **Run
  `npm run db:migrate`.**
- **Engine** (`lib/ops/depletion.ts` → `applyUsageDepletion(accountId, start,
  end)`): groups active recipes by **normalized name**, matches Square
  `sales_item_day` by name, computes target ingredient usage per (day,
  ingredient), then **reconciles by DELTA** against the prior ledger:
  `on_hand -= (target − prior)` and upserts the ledger to `target`. All in one
  transaction.
  - **Idempotent:** re-syncing identical sales → delta 0 → no change. New sales
    deduct only the new amount; removed sales/recipes add stock back (negative
    delta). This is the critical property — re-syncs never double-deplete.
  - **Matching caveat (by design):** only items whose Square name == a recipe
    name deplete. Typed-amount sales (no line item) and unmatched items are
    skipped (counted as `unmatchedItems`). Safe no-op when no recipes match —
    so connecting Square on a fresh account doesn't touch inventory until
    recipes exist.
  - **Theoretical, not actual:** usage = what recipes say. On-hand may drift
    from physical (waste/spills) and **may go negative** (records say you used
    more than you had) — intentionally not floored; **inventory counts remain
    the source of truth**, and the count-vs-depletion gap is shrink/variance.
- **Wiring:** `syncSquareSales` calls `applyUsageDepletion(accountId, start,
  end)` after upserting item sales (same 90-day window).
- **Report:** `inventory.usage({days})` → per-ingredient qty used + cost +
  total (theoretical food cost). UI: `/inventory/usage` page + "Usage" link on
  the Inventory page; Inventory header now notes on-hand auto-updates from
  sales when items match a recipe.
- **Relationship to the P&L (kept deliberate):** the weekly/period P&L food
  cost still uses **received purchases** (actual cash out); usage depletion is
  the **theoretical** lens (per recipe) and powers inventory tracking + the
  usage report. Three honest food-cost views now coexist: purchases (P&L),
  theoretical usage (this), actual via counts (opening+purchases−closing). Not
  silently merged — each answers a different question.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean;
  **full `next build` passed (34/34 pages)**.

## Per-truck operations — Phase 1: money/P&L (2026-06-26)

Made the ops pillar per-truck (was account-wide), matching compliance. Phase 1
covers the money side; Phase 2 (per-truck inventory) is next. See
`00-decisions.md` (2026-06-26) for the design + owner choices.

- **Schema:** `truck_id` added to `sales_day`, `sales_item_day` (nullable; in
  the unique keys now), `expense` (nullable = business-wide), `purchase_order`
  (nullable). `square_connection` is now **per-truck** (added `truck_id`, unique
  on truck instead of account). Migration `0044_blue_outlaw_kid.sql` (column
  adds only — existing RLS covers them). **Run `npm run db:migrate`.**
- **Square sync** (`lib/square/sync.ts`): now **per-truck** — iterates the
  account's active trucks, and for each pulls its location's sales tagged with
  `truck_id`, upserting a connection row per truck. **Stub:** synthetic location
  `stub-loc-{truckId}` (seeded by locationId) so each truck shows distinct demo
  data. **Real:** every truck maps to the merchant's primary location for now —
  a per-truck location picker is deferred to live OAuth (noted). Sales upserts
  key on `(account, truck, source, date[, item])`. `getSquareConnection` →
  `getSquareSummary` (connected-truck count + last sync).
- **P&L** (`periodPnl(..., truckId?)`): optional truck filter on sales,
  expenses, and purchases; omitted = account-wide rollup (incl. business-wide
  expenses). `ops.pnl` takes `truckId`; `ops.connection` returns the summary.
- **Forms:** expense + purchase-order forms get an optional **Truck** select
  (Business-wide / Unassigned default); routers persist `truck_id`.
- **UI:** Operations page has a **truck switcher** (All trucks | each truck) in
  the P&L section header (URL `?truck=`), and the P&L heading shows the scope.
  The SquareSync card now shows "N trucks connected". Other ops cards
  (inventory/expenses snapshots, top items, actual COGS) remain account-wide in
  Phase 1.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean;
  **full `next build` passed (34/34)**.
- **Phase 1 caveat:** per-truck P&L shows that truck's Square sales now; its food
  cost/overhead populate only once expenses/purchases are tagged to it
  (untagged = business-wide, rollup only). Per-truck *inventory* (on-hand,
  counts, usage, depletion) is **Phase 2** — still account-wide today.

## Per-truck operations — Phase 2: inventory (Option B) (2026-06-26)

Completes per-truck ops. Chose **Option B (per-truck ingredients + recipes)**
over the shared-master `truck_stock` model — far lower risk: an additive
`truckId`+filter change (like Phase 1), on-hand stays on the per-truck
`ingredient` row, and the depletion engine isn't re-architected. (See
`00-decisions.md` 2026-06-26 — reverses the earlier "shared menu" choice.)

- **Schema:** `truck_id` added to `ingredient`, `recipe`, `inventory_count`,
  `inventory_usage` (nullable; legacy rows null). Migration
  `0045_lazy_lila_cheney.sql` (column adds; existing RLS covers them). **Run
  `npm run db:migrate`.** No `truck_stock` table.
- **Depletion** (`lib/ops/depletion.ts`): now matches Square item sales to
  recipes **within the same truck** (key = `truckId|normName`), and stamps
  `truck_id` on usage rows. Since ingredient ids are truck-specific, the
  existing (date, ingredient) keying is already per-truck; on-hand still lives
  on the ingredient row.
- **Validators:** `truckId` now **required** on `ingredientInput`,
  `recipeInput`, `inventoryCountInput` (every ingredient/recipe/count belongs to
  a truck).
- **Routers:** inventory `list`/`summary`/`usage`/`listCounts` take an optional
  `truckId` filter; `create`/`update`/`createCount` persist it. recipe
  `list` filters by truck; `create`/`update` persist it.
- **Forms:** ingredient + recipe + count forms gained a required **Truck**
  select; the recipe + count forms **scope their ingredient picker to the
  selected truck** (`inventory.list({ truckId })`, enabled once a truck is
  chosen). New-item pages thread `?truck=` → `defaultTruckId`.
- **UI:** reusable `TruckScopeTabs` (All trucks | each truck) on Inventory,
  Recipes, Counts, and Usage pages (hidden for single-truck accounts); scopes
  list/summary/usage/counts and carries `?truck=` onto the add/sub links.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean;
  **full `next build` passed (34/34)**.
- **Deferred:** "copy menu/inventory to another truck" convenience (removes
  duplicate setup for identical multi-truck menus); per-truck Square location
  picker for live OAuth; scoping the purchase-order ingredient picker to its
  truck (currently shows all account ingredients — harmless, ingredient carries
  its own truck).

**Per-truck operations complete.** Each truck now has its own sales, P&L,
expenses, purchasing, ingredients, recipes, counts, usage, and auto-depletion;
"All trucks" everywhere gives the business rollup. Single-truck operators see no
extra complexity.

## Tier A is complete (steps 1–7). The app is now a two-pillar workspace:
*Stay open* (compliance) + *Stay profitable* (operations: Square sales →
item/menu analytics, inventory + counts, recipes/COGS, purchasing, expenses,
weekly P&L with food-cost %, QuickBooks CSV export, truck service status,
truck change log) — gated to paid plans, viewer-read-only, all on top of Square
+ QuickBooks rather than replacing them.

## Live Square integration (OAuth 2.0) — 2026-06-28

The Square pillar now connects to **real merchant accounts**, not just stub
data. Per-account OAuth with per-truck location mapping.

- **Secrets:** `lib/crypto/secret.ts` — AES-256-GCM `encryptSecret`/
  `decryptSecret`, key derived from `SQUARE_TOKEN_SECRET`. Tokens are encrypted
  at rest; plaintext is never logged.
- **Schema:** `square_oauth` (per-account, unique `accountId`) — merchantId,
  environment, `accessTokenEnc`, `refreshTokenEnc`, expiresAt, scopes,
  connectedByUserId. Migrations **0046** (table) + **0047** (RLS enabled, **no
  policies** = service-role only; never reachable from client).
- **OAuth flow:** `lib/square/oauth.ts` — `squareAuthorizeUrl(state)`,
  `exchangeCode`, `getFreshSquareToken` (auto-refresh when <7 days to expiry),
  `saveSquareTokens`, `getSquareOauthStatus`, `deleteSquareOauth`. Scopes:
  `MERCHANT_PROFILE_READ ORDERS_READ PAYMENTS_READ ITEMS_READ`. redirectUri =
  `${APP_URL}/api/square/callback`.
- **Routes:** `GET /api/square/connect` (sets httpOnly `sq_oauth_state` cookie →
  redirects to Square authorize) and `GET /api/square/callback` (verifies
  state, exchanges code, stores tokens, → `/operations/square?connected=1`).
- **Adapter:** `listLocations()` (GET /v2/locations, filters INACTIVE);
  `squareAdapterForToken(token, env, pinnedLocationId?)`; `getStubSquareAdapter`
  kept for demo.
- **Sync (`lib/square/sync.ts`):** resolves a live token (OAuth → env static →
  stub). **Live:** only syncs `square_connection` rows with a real (non-stub)
  locationId set by the picker. **Stub:** synthetic `stub-loc-${truckId}` per
  active truck. `SyncResult` carries `mode: "live" | "stub"`. New
  `assignTruckLocation()`.
- **Picker:** `/operations/square` page (Pro-gated) + `SquareLocationPicker`
  client component — one `<select>` per truck → `ops.assignLocation`; live list
  from `ops.squareLocations`, current mapping from `ops.truckLocations`. The
  Operations Square card shows **Connect Square** (OAuth hand-off) when the app
  is configured but the account hasn't linked, and a **Locations** link once
  live.
- **Verify:** typecheck clean (lone pre-existing `token.test.ts`); eslint clean;
  **full `next build` passed** — `/operations/square` in the route manifest.

**Setup required (user):** create a Square Developer app, then in `.env.local`
set `SQUARE_CLIENT_ID`, `SQUARE_CLIENT_SECRET`, a random `SQUARE_TOKEN_SECRET`
(≥16 chars), and `SQUARE_ENVIRONMENT=sandbox` to start. Add the OAuth redirect
URL `${APP_URL}/api/square/callback` in the Square dashboard. Without these the
app stays in demo/stub mode (unchanged behavior).

## Fix: Square sync timeout on inventory_usage upsert — 2026-06-29

**Symptom:** live Square sync failed with `canceling statement due to statement
timeout` (PG 57014) on the `inventory_usage` upsert. Schema/index/columns were
all correct — not a logic bug.

**Root cause:** `applyUsageDepletion` ran *two awaited round-trips per
(day × ingredient)* inside a single transaction. Over a 90-day window that's
hundreds of sequential statements holding row locks the entire time; an
overlapping sync (or dev-server retry) blocked on those locks until the 20s
statement timeout fired, aborting the whole sync.

**Fix (`lib/ops/depletion.ts`):**
- Build the reconcile plan in memory, then write in a **short** transaction:
  one `UPDATE` per touched ingredient (net delta aggregated) + a **single bulk
  `INSERT … ON CONFLICT DO UPDATE`** for all usage rows (keys unique by
  construction, so no "affect row twice"). Locks now held for ms, not the whole
  loop.
- **`pg_advisory_xact_lock(hashtext(accountId))`** at the top of the txn so
  concurrent depletions for an account serialize instead of deadlocking.

**Robustness (`lib/square/sync.ts`):** depletion is now wrapped — sales are
already committed before it runs, so a depletion hiccup no longer discards the
sync. Returns `usageDeferred: boolean`; the Square card tells the user to hit
"Recompute usage" if it's ever true.

Verified: typecheck + eslint clean; reproduced the original timeout via a
direct upsert (transient lock), confirmed it clears, and that the index/columns
matched all along.

## Dev utility: ops data reset + sandbox sales seeder — 2026-06-29

Two account-scoped dev scripts (not shipped to users):

- **`npm run reset:ops -- <account> [--yes]`** (`scripts/reset-ops-data.mjs`):
  zero an account's *financial* data for a clean ingest. Dry-run by default
  (prints row counts); `--yes` executes in one transaction. WIPES sales_day,
  sales_item_day, inventory_usage, expense, purchase_order(+items),
  inventory_count(+lines); resets every ingredient `on_hand_qty` to 0; removes
  stub Square connections (`location_id like 'stub%'`). KEEPS trucks,
  ingredient definitions, recipes, the account/users, and real location→truck
  mappings. Account selector: "admin" (default) | email | name.

- **`npm run seed:square -- <account> [--orders N]`**
  (`scripts/seed-square-sandbox.mjs`): create real COMPLETED sandbox orders so
  live ingest can be tested. Needs a **write-capable** token
  (`SQUARE_SEED_ACCESS_TOKEN` or `--token=`) — the app's OAuth token is
  read-only by design (we never write to Square). Resolves a real location via
  `/v2/locations`, warns if its merchant ≠ the connected OAuth merchant, then
  creates orders (line-item names match the seeded stub menu) and pays each
  with the sandbox test card `cnon:card-nonce-ok` so they close. All sales land
  on today's date (Square sets `closed_at` = now).

Used 2026-06-29 to clear the admin (devanlee2nd) demo data — sales, usage, and
expenses all back to $0 — ahead of real Square ingest.

## Per-page How-to guides (onboarding) — 2026-06-29

New users get a short "how-to" on every app page.

- **`lib/page-guides.ts`** — central registry: route → `{ title, intro?, steps[],
  tip? }`. Covers all main pages + `/new` and `[id]` detail routes. Matcher
  normalizes real UUIDs → `[id]`, handles `/items/category/[type]`, and falls
  back to the closest section base.
- **`components/features/page-guide.tsx`** — collapsible "How-to: <title>" panel.
  Defaults expanded (matches SSR, no hydration flash); remembers collapsed state
  per page in `localStorage` (`cl_guide_collapsed:<title>`) so it helps newcomers
  without nagging regulars. Renders nothing for routes without a guide.
- **Wired once** in `components/features/app-shell.tsx` — `<PageGuide />` above
  `{children}`, so it auto-appears on every app page (marketing/auth excluded —
  they don't use the shell). One insertion point; content lives in the registry.

Verified: typecheck + eslint clean; full `next build` passed.

Operations dashboard truck switcher (same day): lifted the truck scope + P&L
granularity controls OUT of the `pnl.hasData` block so you can navigate
truck→truck even with no sales / no Square connection; added a green/grey dot
per truck (Square connected or not) and a truck-aware empty state.

## Square production: 403 fix + one-truck-per-location — 2026-06-29

**Symptom:** production sync failed `Square orders 403 FORBIDDEN / insufficient
permissions`. Token was fine (token/status confirmed ORDERS_READ); the cause was
a **stale sandbox location** (`LB3GHS4FHNWES`) still mapped to a truck — it
doesn't belong to the production merchant, so order-search 403'd, and an
unguarded loop let that one location fail the whole sync.

**Fixes (`lib/square/sync.ts`):**
- Live sync now intersects mapped locations with the merchant's real
  `listLocations()` and **skips any location the token doesn't own** (kills
  stale/foreign mappings before they 403).
- **Per-location try/catch** — one location erroring is logged and skipped, not
  fatal; result reports `locationsFailed` (and `trucksSynced` excludes them).
- New `clearTruckLocation()` to unmap a truck.

**One-truck-per-location enforced:**
- `ops.assignLocation` rejects (`CONFLICT`) a location already held by another
  truck — prevents the double-counting that two trucks on one location caused.
- New `ops.unassignLocation` + picker "None — not connected" option; the picker
  also disables locations already in use by another truck and shows errors.

**Data:** removed the stale sandbox mapping and the duplicate so the production
merchant's single location "cartledger" maps only to truck "Pho Real??".

Diagnostic kept: `scripts/diag-square-token.mjs` (read-only — token scopes via
Square `token/status`, merchant locations vs. mapped locations).

Verified: typecheck + eslint clean; full `next build` passed.
