# CartLedger — Product Overview (for future Claude)

> Repo codename: **PermitKeep**. Public brand: **CartLedger**. Read this first to
> understand what the app *is* today; `00-decisions.md` has the binding
> decisions and the *why*, `01-phase-log.md` has the chronological build log.

## One sentence

CartLedger is **the operating system for food trucks** — a two-pillar web app
that keeps a truck **legal** and **profitable**, sitting *on top of* the tools
operators already use (Square POS, QuickBooks) rather than replacing them.

## The two pillars

1. **Stay open (compliance)** — the original product. Tracks permits,
   inspections, certifications, COIs, commissary agreements, and vehicle items
   per truck; reminds before expiry (email, + SMS/voice on higher plans); AI
   (Claude vision) reads uploaded documents; staff/commissary cascades; an
   append-only audit log; jurisdiction inspection-prep digests; and a **truck
   modification / health-dept change log** (re-inspection tracking).

2. **Stay profitable (operations)** — added 2026-06 after launch feedback that a
   pure compliance tracker felt like "$19 for reminders I can do in a
   spreadsheet." **Plan-gated to Pro+.** It connects Square and turns sales into:
   - **Weekly/daily/monthly P&L** — net sales − food cost − overhead, with a
     food-cost % KPI and an inline SVG line chart (net sales vs. operating
     profit).
   - **Inventory** — ingredients with cost + reorder point (par); low-stock
     flags; periodic **counts** (snapshot + reconcile on-hand).
   - **Recipes** — per-item COGS & margin.
   - **Purchasing** — reorder lists ("generate from low stock"); receiving
     restocks inventory.
   - **Expenses** — overhead ledger (rent, insurance, …).
   - **Item-level sales + menu analysis** — best-sellers; Star/Plowhorse/
     Puzzle/Dog menu engineering.
   - **Auto-depletion (v1.1)** — Square item sales deplete ingredients via
     recipes automatically (idempotent usage ledger) → live inventory + a
     theoretical-usage cost report.
   - **QuickBooks** — CSV export today (live OAuth sync stubbed).
   - **Truck service status** — open/closed + today's location/window.

## The operations data loop (how the pieces connect)

`Square sales → (P&L revenue)` and `Square item sales → recipes → auto-deplete
inventory + usage cost`. `Inventory + par → purchasing reorder list → receive →
restock`. `Counts → actual COGS (opening + purchases − closing)`. `Expenses →
P&L overhead`.

**Three deliberately-separate food-cost lenses** (do NOT merge — see decisions):
1. **P&L food cost** = received purchases (actual cash out).
2. **Theoretical usage** = recipes × sales (auto-depletion; drives inventory).
3. **Actual COGS** = inventory counts (opening + purchases − closing).
The count-vs-depletion gap = shrink/variance.

## Hard product boundaries (decided, do not cross without a conscious pivot)

We are the **brain on top of Square + QuickBooks**, NOT a POS. **Rejected (Tier
B):** offline sales capture, online ordering, pickup/order management, menu
editing/availability, kitchen-display (KDS), condiment-station/ticket-flow.
Building these would make us a worse Square and re-open the "why not just use
Square?" objection. Also out: full accounting/payroll/tax filing (QuickBooks'
job).

## Pricing

**All paid + a 14-day card-required free trial** (no free tier). Tiers:
Starter / Pro / Fleet (`lib/stripe`). Operations pillar is **Pro+** via a
`PLANS.operations` flag enforced by the `opsProcedure` tRPC middleware (also
makes `viewer`-role members read-only). Exact tier→price mapping is still an
owner pricing decision.

## Stack & conventions (see CLAUDE.md for the full list)

Next.js 15 App Router · TS strict · Tailwind · shadcn/ui · **tRPC** (all
mutations) · Drizzle/Postgres (Supabase) · Supabase Auth/Storage · Claude
vision OCR · Stripe (billing) · external integrations (Square, QuickBooks,
Twilio, Resend/Postmark) are **stubbed behind typed adapters** until live creds
— accessed via **raw REST, no SDKs** (e.g. `lib/square`, `lib/quickbooks`).
Account-scoped tenancy; RLS member-select on every table; compliance tables are
audited via a Postgres trigger, **operations tables are intentionally NOT** in
the audit log (operational/recomputable data).

## Where things live

- Schema: `lib/db/schema.ts` (compliance tables first, then the ops pillar).
- Ops logic: `lib/ops/*` (`pnl.ts`, `menu.ts`, `depletion.ts`, `export.ts`),
  `lib/square/*`, `lib/quickbooks/*`.
- tRPC routers: `lib/trpc/routers/*` (ops, inventory, recipe, purchasing,
  expenses, modification, + compliance routers).
- UI: `app/(app)/*` (grouped nav in `components/features/app-shell.tsx`:
  Overview · Finances · Inventory · Compliance · Trucks · Account).
- Marketing: `app/(marketing)/*`.
- **Per-truck ops** (sales/P&L/inventory/recipes scoped per truck, with an
  "All trucks" rollup): code-level walkthrough in
  `notes/03-per-truck-implementation.md`.

## Status

**v1.1 — ready to ship.** Full `next build` green; typecheck/eslint clean
(one unrelated pre-existing `token.test.ts` error). Migrations `0000`–`0043`;
**run `npm run db:migrate` to apply.** Live creds optional (everything runs on
stubs/demo data without them).

**Deferred post-1.1:** automated operational checklist, food-safety/temp logs,
AI assistant (Claude — premium-gated), receipt OCR → expense,
theoretical-vs-actual variance view, live QuickBooks OAuth sync, Square webhook
for incremental sync.
