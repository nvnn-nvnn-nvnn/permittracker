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

- **2026-06-26 — Per-truck operations (multi-truck P&L + inventory).** Ops
  pillar was account-wide only; making it per-truck to match compliance (which
  is already per-truck via `holder_truck_id`). Owner decisions:
  - **Sales → truck:** each truck = its **own Square location**; sales
    auto-attribute. `square_connection` becomes **per-truck** (was per-account).
  - **Inventory/recipes — REVISED 2026-06-26 to Option B (per-truck
    everything), reversing the earlier "shared menu, per-truck stock" choice.**
    Each truck owns its **own ingredients AND recipes** (`truck_id` on both);
    on-hand stays on the `ingredient` row (the row itself is per-truck). Chosen
    over the shared-master model (`truck_stock`) because B is a **far lower-risk
    additive change** (same `truckId`+filter pattern as the money phase — no
    re-architecting where on-hand lives, no rewrite of the just-stabilized
    depletion engine). Trade-off: a multi-truck operator with an identical menu
    re-enters ingredients/recipes per truck (no single shared menu); mitigate
    later with a **"copy menu/inventory to another truck"** convenience. Single-
    truck operators (most users) see no difference. The shared-master model
    stays a future option if real users demand one editable menu across trucks.
  - **Expenses:** `expense.truck_id` **nullable** — tagged to a truck, or NULL =
    business-wide (rollup only).
  - **Rollup:** queries take an optional `truckId`; omitted = account-wide
    rollup (current behaviour, kept). Pro+ sees the rollup + per-truck.
  - **Pre-launch** (no production data) → new `truck_id` columns can be added
    without backfill pain; kept **nullable** so existing dev rows don't break
    (NULL sales/expenses show only in the rollup).

  **Built in two coherent, build-clean phases (so v1.1 stays stable):**
  - **Phase 1 — per-truck money/P&L:** `truck_id` on `sales_day`,
    `sales_item_day`, `expense`, `purchase_order`; `square_connection`
    per-truck; sync attributes sales by truck; `periodPnl(..., truckId?)`
    filter; Operations **truck switcher** (All trucks | each truck) + per-truck
    Square connect; expense/purchase forms get an optional truck.
  - **Phase 2 — per-truck inventory (Option B):** `truck_id` on `ingredient`,
    `recipe`, `inventory_count`, `inventory_usage`; inventory list/summary/
    counts/usage + recipes + auto-depletion scoped to a truck (match item sales
    to recipes WITHIN the same truck; on-hand stays on the per-truck ingredient
    row); Inventory + Recipes truck switchers. No `truck_stock` table.

- **2026-06-25 — v1.1: Auto-depletion bridge built (sales → recipe →
  inventory) + READY TO SHIP v1.1.** The previously-deferred bridge is now
  built. Square item sales deplete ingredient on-hand via recipes and feed a
  per-day usage ledger (`inventory_usage`).
  - **Idempotent reconcile chosen** (not "subtract on every sync"): the ledger
    stores cumulative usage per (day, ingredient); each sync applies only the
    DELTA to on-hand. This is the binding correctness decision — re-syncs can't
    double-deplete. Implemented in `lib/ops/depletion.ts`, called from
    `syncSquareSales`.
  - **Name-match dependency (accepted):** only items whose Square name matches
    a recipe deplete; typed-amount/unmatched sales are skipped. Safe no-op
    until recipes exist. An explicit Square-item→recipe mapping table is the
    future hardening if name-matching proves too brittle.
  - **On-hand may go negative (accepted, not floored):** depletion is
    *theoretical*; physical **counts remain source of truth**; the gap =
    shrink/variance.
  - **THREE food-cost lenses kept separate, NOT merged (binding):** (1) P&L
    food cost = received **purchases** (actual cash out); (2) **theoretical**
    usage = recipes × sales (this feature, drives inventory + usage report);
    (3) **actual** COGS = counts (opening+purchases−closing). Each answers a
    different question; merging them would mislead. P&L definition left
    unchanged.
  - **v1.1 ship readiness:** with this, the ops loop is automatic end-to-end.
    Full `next build` green (34 pages), typecheck/eslint clean. **Pre-ship
    checklist (ops/env, not code): run `npm run db:migrate` (applies 0023–0043);
    finalize `PLANS` tier→price mapping; set live creds when ready
    (`SQUARE_ACCESS_TOKEN`, `STRIPE_*`, `QUICKBOOKS_*` — all stubbed/optional
    today).** Deferred post-1.1: automated checklist, food-safety/temp logs, AI
    assistant, receipt OCR→expense, theoretical-vs-actual variance view.

- **2026-06-25 — Feature roadmap: Tier A ("ops brain") IN, Tier B
  ("POS/ordering") OUT.** Owner reviewed a broad food-truck feature wishlist.
  Binding decision: build only features that make us the **operations/analytics
  brain on top of Square + QuickBooks**, and **reject** anything that turns us
  into a POS or order pipeline.
  - **Tier B — rejected (do NOT build):** offline sales capture, basic online
    ordering, pickup/order management, menu editing & item-availability toggles,
    prep-timing / kitchen-display (KDS), condiment-station workflow. Rationale:
    each makes us the cash register / order pipeline, which contradicts the
    "don't build a POS — Square owns that" decision, re-opens the "why not just
    use Square?" objection (as a *worse* POS), and — for online ordering — is a
    whole separate company (storefront, payments, PCI). A deliberate ordering
    bet (Owner.com-style) remains possible later but must be a conscious,
    separate decision, not smuggled in on a feature list.
  - **Tier A — accepted, in sequence:** (1) Square **line-item ingestion** →
    item-level sales reports ✅; (2) **menu-simplification suggestions**
    (Star/Plowhorse/Puzzle/Dog) ✅; (3) **inventory counts/snapshots** → true
    actual COGS ✅; (4) **QuickBooks sync** (Slice 4) — to build stubbed-adapter
    first, like Square; (5) **truck location / service-window status**
    (customer-facing); (6) **health-dept change log** for truck modifications
    (compliance pillar); (7) **enforce staff roles** on ops screens +
    plan-gating. **All 7 steps done — Tier A complete.** Plan-gating uses a
    `PLANS.operations` flag (starter off, pro/fleet on) + an `opsProcedure`
    middleware (entitlement + viewer-read-only); **exact tier→price mapping
    remains an owner pricing decision** (the flag makes re-tiering one line).
    Build details per step are in
    `01-phase-log.md`.

- **2026-06-25 (later same day) — No free tier; reposition as an all-paid
  "seamless workspace for vendors."** Reverses point 1 of the earlier
  same-day entry (free tier = 1 truck). Owner's reasoning: with the operations
  pillar + the features below, the product is no longer a commodity tracker you
  could replace with a spreadsheet, so it doesn't need to be given away. **All
  tiers paid**, including Starter (1 truck) — gating now happens *within* the
  paid tiers (which features live in which tier), not via a free tier.
  - **CONFIRMED (2026-06-25): a time-limited free TRIAL, not a free tier.**
    14-day full-access trial, then convert to paid. Preserves
    try-before-you-buy / top-of-funnel for the skeptical launch audience
    without giving the product away forever. **Build order: trial mechanism
    FIRST, then Slice 2 (inventory).**
    - Reuses existing machinery: `account.plan_status` enum already has
      `trialing`, and `effectiveTier()` already grants the full tier's features
      while `status === "trialing"` — so a trial user gets full access with no
      new gating logic. Trial end tracked via `current_period_end` (or a new
      `trial_ends_at`); at expiry the account drops to the `none`/`canceled`
      floor (locked) until they subscribe. Stripe supports
      `trial_period_days` on the subscription, so the trial can run through the
      same Checkout/webhook path already built in Phase 5.
    - **OPEN param (need owner call): card-required vs no-card trial.**
      Card-required converts far better but suppresses signups; no-card gets
      more signups, lower conversion. Recommend **card-required via Stripe
      Checkout `trial_period_days`** (cleanest given billing is already wired).
  - **Expanded product vision — "seamless workspace for vendors":** metrics
    tracking, inventory tracking, Square + QuickBooks integration (with a
    **barebones expense/bookkeeping ledger as the QB fallback**), an
    **automated operational checklist** spanning orders / billing / inventory
    *and* compliance (the cross-pillar daily "what do I need to do today"
    surface — the connective tissue + daily-engagement hook), and an **AI
    assistant**.
  - **AI assistant = Claude, not GPT.** Reuse the already-wired
    `@anthropic-ai/sdk` + `ANTHROPIC_API_KEY` (OCR pipeline); no OpenAI
    dependency. Gated as a premium / top-tier feature. Default to the latest
    Claude model when built.
  - **Roadmap absorbs the new asks** on top of the existing slice sequence:
    Slice 1 (Square + weekly P&L) ✅ done; Slice 2 = inventory + recipe usage +
    purchasing (keystone — feeds the checklist + ledger); Slice 3 = expense /
    barebones bookkeeping ledger (QB fallback); Slice 4 = QuickBooks sync;
    + new workstreams: automated checklist, AI assistant (premium-gated).
  - **Build queue (in order):** (1) **trial mechanism** ✅ done (14-day,
    card-required via Stripe Checkout `trial_period_days`); (2) **Slice 2 —
    split into 2a/2b/2c to keep each delivery shippable end-to-end**:
    **2a inventory (ingredients)** ✅ done; **2b recipes + usage (COGS/margin)**
    ✅ done; **2c purchasing list** ✅ done — **Slice 2 complete**. Then, not yet
    scheduled: `PLANS` tier re-pricing +
    feature flags (incl. an `operations` capability flag and AI gating),
    plan-gating enforcement on the `ops` router, **Slice 3 (expense / barebones
    bookkeeping ledger)** ✅ done, Slice 4 (QuickBooks), automated checklist,
    AI assistant (premium-gated), and sales→recipe attribution (to put COGS in
    the weekly P&L).
  - **CURRENT roadmap = the Tier A entry above (2026-06-25).** Status: trial ✅,
    Slice 1 (Square + weekly P&L) ✅, Slice 2 (inventory/recipes/purchasing) ✅,
    Slice 3 (expenses) ✅, P&L food cost via received purchases ✅, actual COGS
    via inventory counts ✅, item-level sales ✅, menu analysis ✅. **Note:
    sales→recipe attribution was deferred** in favour of purchases-based food
    cost (P&L) + count-based actual COGS — cheaper, no Square-catalog/mapping
    dependency. Still pending: QuickBooks, truck status, health-dept change log,
    staff-role enforcement + `PLANS` re-pricing/feature-flags, automated
    checklist, AI assistant.

- **2026-06-25 — Second product pillar added: culinary operations
  ("Stay profitable") alongside compliance ("Stay open"). Two pillars, one
  app.** Trigger: a Reddit / Product Hunt launch drew a recurring complaint —
  "$19/mo for compliance reminders I can do free in a spreadsheet / Google
  Calendar." Read as a *value-perception* problem (a pure reminder tracker
  reads as commodity), not just a price problem. Two-part response, confirmed
  with the owner:
  1. **Free tier = 1 truck. ⚠️ SUPERSEDED later same day — see the
     2026-06-25 "No free tier" entry above.** (Original rationale kept for the
     record: a single-truck free tier to defuse the "sneaky subscription" line.
     Never implemented — `PLANS`/`lib/limits.ts` were not changed — and then
     reversed once the product scope expanded past a commodity tracker.)
  2. **Add an operations pillar, do NOT pivot away from compliance.** Owner
     chose "two pillars, one app" over a full pivot or a separate product.
     Story: compliance = *Stay open*; operations = *Stay profitable*. Positioned
     as "the operating system for your food truck." Compliance code/data model
     is untouched; ops is additive.

  **Scope is sequenced — the full ops "MVP" is a 3–6 month, two-integration
  build and will NOT ship in one round.** Agreed sequence:
  - **Slice 1 (THIS round): Square sales sync + weekly P&L dashboard.** The
    thinnest wedge that proves the thesis — replaces the "export Square →
    spreadsheet every week" workflow and shows dollar-value fast.
  - Slice 2: inventory + recipe/usage depletion + purchasing list.
  - Slice 3: manual overhead expense tracking (feeds the P&L).
  - Slice 4: QuickBooks export / sync.

  **Explicitly OUT of scope (now and likely permanently):** full POS, payroll,
  tax filing, full accounting. Those live in Square / QuickBooks already; the
  app owns the *operations layer between them* (purchasing, inventory/usage,
  waste/variance, overhead, weekly performance).

  **Adapter posture (consistent with kickoff decision #1).** Square and
  QuickBooks are external integrations and will be **stubbed behind typed
  adapter interfaces** (local/no-op + a fixture/simulator) until live creds,
  exactly like Stripe/Twilio/Resend/Postmark — swapping in the real SDK must
  touch only the adapter binding, not call sites. The real Square / QuickBooks
  SDKs are **new dependencies outside the brief's stack**; per CLAUDE.md ("Ask
  before adding dependencies") they require owner sign-off before install, so
  Slice 1 builds against the stubbed adapter first. Same account-scoped /
  archive-only / audited tenant model as every other table.

- **2026-06-15 — Product scope expanded: compliance tracker → compliance +
  vendor event pipeline.** Added a first-class `Event` entity (prospective
  events the vendor applies to) with an application-status pipeline
  (`interested → applied → waitlisted → accepted → confirmed → rejected →
  withdrawn → attended`). Rationale: a recurring market gap — all event
  software is planner-side; vendors have nowhere to track which events they're
  applying to and each application's status. **Decision: `Event` is a separate
  entity, NOT a `status` column on `venue`.** A venue = a reusable place/COI
  requirement profile (one venue, many events over time); the *application* is
  what has a status. `event.venueId` optionally links the two, and when an event
  is accepted/confirmed the detail page surfaces the linked venue's COI /
  additional-insured requirements — the compliance tie-in that differentiates
  this from a generic CRM. Same tenant model as every table (account-scoped,
  archive-only, audited via `permitkeep_audit('event')`, RLS member-select).
  Migrations 0021 (table) + 0022 (audit/RLS). Phase-log has the build details.

- **2026-06-15 — Product is now location-agnostic (reverses kickoff decision
  #2's MN framing for user-facing surfaces).** All user-facing references to
  Minnesota / Twin Cities removed; `MN_JURISDICTIONS` → generic
  `DEFAULT_JURISDICTIONS` (State/City/County Health Dept, etc.), Terms governing
  law no longer names a state. Internal kickoff decision #2 left as historical
  record. Rationale: owner wants the location kept as vague as possible
  pre-production; tying the product to one metro narrows positioning.

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

## Tooling / workflow

These are local dev-environment / Claude Code settings, not product decisions.

- **2026-06-26 — Claude Code runs in `bypassPermissions` mode.** Set
  `permissions.defaultMode = "bypassPermissions"` in the global
  `~/.claude/settings.json`, so all sessions (every project) start with
  permission prompts disabled — Claude executes edits/bash/etc. without
  asking. Owner-requested for speed. Trade-off: no approval gate on
  destructive commands (`rm -rf`, force-push). Revert by removing that line
  or setting it back to `"default"` (or via `/config`). A safer middle
  ground if ever wanted: `"acceptEdits"` (auto-approves edits, still prompts
  on bash).

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
