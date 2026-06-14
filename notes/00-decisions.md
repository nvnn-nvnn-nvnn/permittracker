# PermitKeep — Decisions Log

This file records binding decisions and any stack deviations with rationale.
Newest entries at the top of each section.

## Project kickoff decisions (2026-05-16)

These were confirmed with the owner before any code was written.

1. **Credentials posture: "Supabase + Anthropic ready".**
   - Supabase (Postgres, Auth, Storage) and Anthropic (Claude vision) are treated
     as live integrations driven by env vars.
   - Stripe, Twilio, Resend, Postmark are **stubbed behind typed adapter
     interfaces** with local/no-op implementations until later phases. Swapping in
     real SDKs must not require touching call sites — only the adapter binding.

2. **Launch metro: Twin Cities, Minnesota** (Minneapolis + Saint Paul metro).
   - Jurisdiction seed data targets MN: Minnesota Dept of Health (MDH),
     Minnesota Dept of Agriculture (MDA), Minneapolis Health Dept,
     Saint Paul Dept of Safety & Inspections (DSI), Hennepin County,
     Ramsey County. Drives default jurisdiction options + Phase 10 content scope.
     
3. **Stack: follow the brief.** Deviations are permitted only when justified, and
   every deviation must be logged in the "Stack deviations" section below so the
   owner can review the what/why.
4. **Admin app: same Next.js app, route group `/admin`, role-gated** by a
   platform-admin flag. No separate deployment.

## Stack deviations

(none — building the brief's stack as written)

## Data-model scope decisions (not stack deviations)

- **2026-05-26 — `compliance_item.jurisdiction` is required at the input
  layer.** Zod (`itemInput.jurisdiction`) now enforces `min(1)`; the form
  marks the input `required`. The DB column remains nullable for now —
  existing rows may have NULL and we don't want a `NOT NULL` migration to
  fail on the populated table. Follow-up: backfill + `NOT NULL` migration
  once existing rows are audited. Rationale: every compliance item is
  issued by some authority; an empty jurisdiction is data debt. Considered
  and rejected: forcing child item jurisdiction to match its parent —
  real-world parent→child chains routinely cross jurisdictions
  (statewide MFU license → city event permit), so that rule would block
  the common case.

- **Phase 2 — reminder offsets on the item, not a separate table.** The
  brief's ReminderSchedule defaults are stored as `compliance_item
  .reminder_days_before` (int[]). Rationale: avoid a near-empty table that
  duplicates per-item config.
- **Phase 4 — no `ReminderSchedule` table.** Reaffirms the above: the item's
  offsets *are* the schedule. We added only `reminder_dispatch` (rows
  actually sent/attempted). `reminder_dispatch` has no audit trigger — the
  brief explicitly allows hard-deleting dispatches and we recompute them on
  every item change. Full reasoning in `04-phase-4-explained.md` §1–2.
- **Phase 4 — reminder recipient = account owner email.** Per-member /
  per-channel routing (SMS/voice) is Phase 7–8; Phase 4 ships email only.
- **2026-05-19 — UI direction: brand-forward / warm, global polish pass.**
  Owner asked for a more sophisticated UI. Chosen direction (asked, not
  assumed): warm terracotta brand + warm neutrals (not clinical grey),
  applied as a *token + primitive* pass (no layout rewrites, low risk):
  rewrote `globals.css` (oklch warm palette, `--brand`, `--shadow-soft/pop`,
  radius 0.75rem, tighter heading tracking); refined `button` (brand shadow,
  hover lift, ring offset, active press), `card` (soft shadow), `input`/
  `textarea` (4px brand focus ring), and the app shell (brand "P" mark,
  active-nav pill + accent bar, warm sidebar, sticky blurred mobile bar);
  unified the wordmark to the brand color in auth/marketing. No stack/scope
  change; every screen improves via the shared tokens.
- **Phase 8 — voice = third reminder channel; cascades extended.** Voice
  is one escalation dispatch at the 7-day expiry mark (Pro+, phone set),
  skipped at send time if any prior reminder for the item was acknowledged
  (brief). Venue has no own cascade (an expired COI is already RED via the
  item rule) — it carries additional-insured / COI-requirement text. Person
  certs cascade cross-truck to assigned ACTIVE trucks: expired → RED,
  expiring ≤30d → YELLOW (commissary-consistent). `person_truck` is a
  hard-deletable join, re-synced per person save → no audit trigger (like
  reminder_dispatch); venue/person are audited. Twilio voice stubbed
  (adapter + simulator) until creds/A2P.
- **Phase 7 — inbound transport stubbed, cores real.** Postmark/Twilio
  webhooks are implemented but exercised in dev via tRPC simulators that
  call the identical core functions (no tunneling / no A2P 10DLC wait).
  SMS recipient = single `account.sms_phone` (per-member routing later).
  Body-only renewal emails create/annotate a draft but skip the
  `extraction_proposal` (its `file_id` FK requires an attachment).
  Postmark inbound auth = shared `?secret=` (Postmark doesn't sign inbound);
  Twilio request-signature validation deferred until live creds.
- **Phase 5 — prices by `lookup_key`, not stored IDs.** No Stripe price IDs
  in env/DB. `npm run stripe:setup` stamps stable lookup keys; runtime
  resolves ID↔meaning and caches. Re-runnable, environment-portable.
- **Phase 5 — webhook is the only writer of plan state.** UI never sets
  `plan_tier`; `applySubscription`/`clearSubscription` (one reconciler,
  shared by webhook + manual sync) do. Handler errors return 500 so Stripe
  retries.
- **Phase 5 — `effectiveTier` floor.** A `none`/`canceled` account is
  enforced at Starter limits (no keeping Pro caps after cancel). Consequence:
  limits work *before Stripe is configured at all*.
- **Phase 5 — billing is owner-only**, and all billing actions are
  resilient when unconfigured (friendly `PRECONDITION_FAILED`, app keeps
  working). Local webhooks need the Stripe CLI; a manual "Sync from Stripe"
  is the fallback (added to Known caveats).
- **Phase 6 — commissary = dedicated date columns**, not ComplianceItems.
  `permit_expiration` + `contract_expiration` on a `commissary` table
  (matches the brief's wording; lighter than full items).
- **Phase 6 — commissary lapse cascades to RED** for dependent *active*
  trucks (legally can't operate); expiring ≤30d → YELLOW. Inactive trucks
  don't trigger it.
- **Phase 6 — parent→child inherits urgency**, propagated by a bounded
  fixpoint loop so multi-level chains cascade. Deep cycle (A→B→A)
  *prevention* is deferred — only self-reference is blocked; the loop is
  capped so a cycle can't hang the request (added to Known caveats).
- **Phase 4 (post-sign-off) — "catch-up" reminders.** Originally recompute
  *dropped* any reminder whose computed send-time was already in the past.
  That silently produced **zero** reminders for the most urgent case (an
  item added late, or expiring sooner than its largest offset). Fixed: if
  the send-time is past **but the item hasn't expired yet**, the dispatch is
  clamped to "now" so it goes out on the next cron tick / "Run due reminders
  now". Genuinely stale (item already expired) is still skipped — the
  dashboard's RED/expired state owns that. Found while debugging "no emails"
  (the row was simply scheduled 33 min in the future at the fixed 13:00 UTC
  send time — not a bug, but it exposed this real gap).

## Known caveats / limitations (revisit later)

- **Concierge onboarding deferred at launch (2026-05-21).** The $49
  one-time white-glove-setup add-on is **hidden in the UI** —
  `components/features/billing-panel.tsx` has the purchase button and its
  `createConciergeCheckout` mutation hook commented out. Everything else
  stays wired: the Stripe webhook still handles
  `checkout.session.completed` with `metadata.kind === "concierge"` (so
  any back-channel test purchase still flows through),
  `account.conciergePurchasedAt` / `conciergeCompletedAt` columns remain,
  `/admin` concierge queue continues to work for any historical rows, and
  the `markConciergeComplete` admin mutation is still callable. Re-enable
  is uncommenting **two blocks** in `billing-panel.tsx` (the `concierge`
  hook + the button) — zero code change, no migration.
- **SMS / voice deferred at launch (2026-05-21).** Twilio A2P 10DLC
  registration not yet submitted; SMS reminders and voice escalation are
  **disabled** at launch. Email is the sole reminder channel. The
  `reminder_dispatch.channel` enum already supports `sms`/`voice` so
  re-enabling is configuration, not code: submit A2P, add
  `TWILIO_ACCOUNT_SID/AUTH_TOKEN/FROM_NUMBER` to env, revert the pricing
  copy that marks SMS/voice as "Coming soon". Until then,
  `PLANS[tier].sms` / `voiceEscalation` flags on Pro/Fleet are advisory
  only — the dispatcher won't create those channel rows and the no-op
  adapter would skip them anyway.
- **Inbound email (Postmark) deferred at launch (2026-06-03).** Inbound
  parsing is **not wired in prod** — the "forward to
  `{slug}@inbound.permitkeep.com`" convenience channel is disabled at
  launch. It's an input convenience, not core compliance tracking: users
  add items via the UI + OCR upload path instead. Nothing is removed — the
  `/api/webhooks/postmark-inbound` route, `processInboundEmail()` core, and
  the Settings inbound **simulator** (which calls the same core) all remain,
  so the feature is fully demoable without Postmark live. Re-enable is
  config, not code: stand up the Postmark inbound server, set
  `POSTMARK_INBOUND_SECRET` (the route's shared-`?secret=` gate — Postmark
  doesn't sign inbound), and un-hide the inbound affordance. Mirrors the
  Twilio deferral pattern.
- **Sentry PII scrubbing — posture + known gaps (2026-06-03).** Sentry is
  wired with the "never log permit/COI numbers or extracted document text"
  rule enforced in layers. Primary protection: `sendDefaultPii: false` on
  every `Sentry.init` (withholds request bodies, cookies, headers, IP) plus
  the fact that Sentry's Node SDK doesn't capture local variable values in
  stack frames — so OCR fields living in locals/DB rows never get collected.
  `lib/observability/scrub.ts` (`beforeSend`) is **defense-in-depth**, not the
  whole defense: it deletes `request.data`/`query_string`/`cookies` +
  `authorization`/`cookie` headers and strips a denylist of sensitive keys
  from `event.extra`. **Two deliberate gaps:** (1) it does **not** scrub
  exception *message* strings — relying on the discipline *never interpolate
  document text or permit numbers into an `Error(...)`* (current code is
  clean; `lib/extraction/run.ts` only interpolates UUIDs); (2) it only sweeps
  `event.extra`, not `event.contexts` (we don't call `setContext` with OCR
  data). Hardening (regex redaction over messages + a contexts sweep) is
  future work, acceptable to defer at launch. If anyone adds `Sentry.setExtra`
  /`setContext`/error-message interpolation touching document data, revisit.
- **Supabase direct DB connection is IPv6-only — use the pooler (2026-06-06).**
  The direct connection host `db.<ref>.supabase.co:5432` resolves to an
  **AAAA (IPv6) record only** — no IPv4. On any network without working IPv6
  (a VPN was the culprit here), Node's `getaddrinfo` fails with `ENOENT` and
  *every* DB query dies (`/admin` 500s on the `app_user` upsert, etc.). It
  looks like a code/Sentry bug but isn't — it's pure DNS/connectivity.
  Diagnose with `nslookup <host>` (IPv6-only address) + `ping` (can't find
  host on IPv4). **Fix:** switch `DATABASE_URL` to the Supabase **connection
  pooler** (`...pooler.supabase.com`, user `postgres.<ref>`), which has an
  IPv4 address. Use the **Session pooler (port 5432)** for a clean drop-in
  (behaves like a direct connection, prepared statements OK); the
  **Transaction pooler (6543)** needs `prepare: false` in the postgres.js
  driver, so reserve it for serverless/prod if needed. Applies to the Vercel
  prod `DATABASE_URL` too. Currently dev still uses the direct connection
  (works only with IPv6 up) — pooler swap is a pending robustness fix.
- **Sentry event routing = DSN's project, not `SENTRY_PROJECT` (2026-06-03).**
  Events land in whichever project **owns the DSN**; `SENTRY_PROJECT` only
  controls build-time source-map upload. Cost us debugging time once (a stray
  `javascript-nextjs` project's DSN vs. the dashboard open on `vendguard`).
  Live project is **`vendguard`** (org + project both `vendguard`); the
  `NEXT_PUBLIC_SENTRY_DSN`/`SENTRY_DSN` in env must be that project's DSN. If
  "events aren't showing up": confirm the DSN's project matches the dashboard
  view (env=All, last 24h), and remember client events can be silently dropped
  by ad-blockers — test server-side (`captureException` + `flush`) to isolate.
- **Resend dev sender.** `EMAIL_FROM` defaults to Resend's shared
  `onboarding@resend.dev`, which **only delivers to the email the Resend
  account was created with**. If that differs from the PermitKeep
  account-owner email, reminders won't arrive. Production needs a verified
  domain address in `EMAIL_FROM`.
- **"sent" ≠ "delivered".** A `sent` dispatch means the email adapter
  accepted it (Resend queued it), not that it reached an inbox. True
  delivery/bounce needs a Resend delivery webhook — deferred to the Phase 7
  webhook work; `dispatch_status` will gain `delivered`/`bounced` then.
- **Stub email silently "succeeds".** With no `RESEND_API_KEY` the no-op
  adapter returns fake success, so a dispatch is marked `sent` though
  nothing left. Acceptable pre-key, but flagged; making the stub mark
  `skipped` instead is a candidate cleanup.
- Fixed-time send window is **13:00 UTC**; not yet account-timezone aware.
- **Parent-item deep cycles not prevented.** Only direct self-reference is
  blocked. An A→B→A chain is possible via the API; the status fixpoint loop
  is bounded (`items.length + 1`) so it can't hang — it just yields a
  bounded, non-meaningful result. A proper acyclic check is future work.
- **Stripe local webhooks need the Stripe CLI** (`stripe listen --forward-to
  localhost:3000/api/webhooks/stripe`). Without it, plan changes only
  reconcile via the manual "Sync from Stripe" button (auto-called on return
  from Checkout). Production uses a real webhook endpoint + secret.
- **Concierge via manual sync isn't auto-detected.** The concierge flag is
  set by the webhook on `checkout.session.completed`; "Sync from Stripe"
  only reconciles subscriptions, not one-time payments. Fine with the CLI
  running; noted for dev-without-CLI.
- **"Cannot find the middleware module" during a phase-boundary build.**
  Verifying a phase ends with one clean `next build`, which requires
  stopping `next dev` and wiping `.next`. Any browser request that lands in
  that ~few-second gap shows `Cannot find the middleware module` (Next's
  compiled middleware bundle momentarily doesn't exist). It is **transient
  and self-clears** on the next dev compile — not a code defect.
  Mitigation/process: the build→wipe→restart only happens at phase
  boundaries; we flag it before running it, then hard-refresh after. A
  persistent occurrence (survives a clean `rm -rf .next` + restart) WOULD
  indicate a real middleware import error and should be investigated.

### Scaffold corrections (not deviations, but notable)

- **2026-05-16 — Pinned Next.js to 15, not 16.** `create-next-app@latest`
  installed Next 16.2.6 by default. The brief mandates Next 15, and the
  `@supabase/ssr` + shadcn/ui ecosystem is most stable there, so we
  `npm install next@^15.5.0 eslint-config-next@^15.5.0` → resolved to
  **15.5.18** with React 19.2.4. Removed the Next-16 `AGENTS.md` that
  create-next-app injected (its "this is not the Next.js you know" guidance is
  false for v15) and repurposed `CLAUDE.md` as the project guide.
- **2026-05-16 — ESLint flat config + `@eslint/eslintrc`.** The Next-16
  scaffold's `eslint.config.mjs` imported `eslint-config-next/core-web-vitals`
  (Next 16 style) which doesn't resolve against the pinned
  `eslint-config-next@15`. Rewrote the flat config to the Next-15 standard
  `FlatCompat().extends("next/core-web-vitals","next/typescript")` and added
  dev dep `@eslint/eslintrc` — this is exactly what `create-next-app@15` would
  have installed, so it's a toolchain correction, not a stack deviation.
- **2026-05-16 — Extra TS strict flags.** Added `noUncheckedIndexedAccess`,
  `noImplicitOverride`, `forceConsistentCasingInFileNames` on top of
  `strict: true` to honor "TS strict everywhere". Next reformatted tsconfig
  and set `jsx: preserve` automatically (expected).

## Security / dependency decisions

- **2026-06-13 — Append-only audit log gains ONE erasure escape hatch.**
  Phase 2 made `audit_log` immutable "even to us" (BEFORE UPDATE/DELETE trigger
  raises for all roles + REVOKE from PUBLIC). GDPR/CCPA right-to-erasure forces a
  narrow exception: migration `0018_purge_account_audit.sql` rewrites
  `permitkeep_audit_block()` to allow a **DELETE** when the transaction-local GUC
  `permitkeep.allow_audit_purge = 'on'`. Only `purge_account_audit(accountId)`
  (SECURITY DEFINER) sets that flag, deletes one account's rows, unsets it; the
  flag is tx-local so it auto-closes and can't leak across pooled connections
  (same mechanism as `permitkeep.actor_id`). **UPDATE remains blocked
  unconditionally** — the log is still un-editable; it is only *erasable* for a
  whole account via the one sanctioned deletion path. Rationale: tamper-evidence
  defends against bugs/malice, which a deliberate legal erasure is neither.
  Trust model unchanged: non-privileged roles still can't touch `audit_log`
  (RLS + REVOKE); only the trusted server (service role) can invoke the function.
  Re-run the Phase 2 append-only probe after applying 0018 to confirm normal
  UPDATE/DELETE still raise.


- **2026-06-11 — `npm audit`: 6 moderate findings accepted, NOT force-fixed.**
  `npm audit` reports two transitive, **build/dev-time-only** advisories:
  (1) **esbuild ≤0.24.2** (GHSA-67mh-4wv8-2f99, dev-server response leak) pulled
  in via `drizzle-kit` → `@esbuild-kit/esm-loader`; drizzle-kit is a
  **devDependency** used only for `db:generate`/`db:push`, and uses esbuild to
  load its TS config, not to serve — not in the deployed app. (2) **postcss
  <8.5.10** (GHSA-qx2v-qp2m-jg93, XSS on stringify of attacker CSS) bundled
  inside `next`; postcss only processes our own stylesheets at build time, never
  visitor input. Neither is reachable by a running-app request. **Decision:** do
  **not** run `npm audit fix --force` — it would downgrade `drizzle-kit`
  0.31→0.18 and `next` 15.5→9.3 (catastrophic breaking changes) to clear
  moderate, non-exploitable transitive advisories. Resolve the proper way:
  **upstream version bumps** of `next`/`drizzle-kit` once they ship patched
  transitive deps (`npm outdated`), staying on Next 15 / current drizzle-kit. If
  a clean audit is ever required for compliance, prefer a scoped `overrides`
  pin (after verifying the build) or a documented exception — not `--force`.
  Not a launch blocker.

## Environment notes

- Dev machine: Windows 11, Node v22.19.0, npm 11.6.0, git 2.46.0.
- Repo initialized locally; no remote configured yet.
- `.claude/` holds Claude Code memory — do not delete or commit secrets into it.
