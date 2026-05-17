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

**Awaiting owner demo + sign-off before Phase 3.**
