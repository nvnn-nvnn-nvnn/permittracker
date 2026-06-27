# Per-truck operations — implementation reference (for future Claude)

How the per-truck ops feature actually works in code (2026-06-26). The *why* is
in `00-decisions.md`; the chronological log is in `01-phase-log.md`. This doc is
the **code-level map** so you can navigate and extend it.

## The one core pattern

Every ops table carries a **nullable `truck_id`**, and every read takes an
**optional `truckId`**:

```ts
.where(and(
  eq(table.accountId, accountId),
  truckId ? eq(table.truckId, truckId) : undefined,  // drizzle ignores undefined
))
```

- `truckId` provided → that truck's data.
- `truckId` omitted → **account-wide rollup** (all trucks + NULL/business-wide
  rows). This is the default and preserves pre-per-truck behaviour.
- Columns are **nullable** (pre-launch, no backfill); NULL rows surface only in
  the rollup. New writes always set `truck_id` (forms require it where it's a
  required field).

## Money side (Phase 1)

**Schema (`lib/db/schema.ts`):** `truck_id` on `sales_day`, `sales_item_day`
(both now in their unique keys: `(account, truck, source, date[, item])`),
`expense` (nullable = business-wide), `purchase_order`. `square_connection` is
**per-truck**: added `truck_id`, unique moved from account → truck.

**Sync (`lib/square/sync.ts` → `syncSquareSales`):** loops the account's active
trucks; for each, resolves a locationId (`stub-loc-${truck.id}` for the stub,
merchant primary for real), pulls that location's daily + item sales, and
**upserts them tagged with `truckId`** (onConflict targets include `truckId`).
Writes one `square_connection` row per truck (onConflict on `truckId`). Then
calls `applyUsageDepletion` once. `getSquareSummary` returns connected-truck
count + last sync (replaced the old single-row `getSquareConnection`).
The **stub** (`lib/square/index.ts`) seeds by `` `${locationId}:${date}` `` so
each truck shows distinct demo numbers.

**P&L (`lib/ops/pnl.ts` → `periodPnl(accountId, granularity, periods?,
truckId?)`):** the optional `truckId` filters sales, expenses, and purchases
with the pattern above. `ops.pnl` (router) passes it through; `ops.connection`
returns the summary.

**Forms:** `expense-form` + `purchase-order-form` got an optional Truck `<select>`
("Business-wide / Unassigned" default); routers persist `truck_id`.
`expenseInput`/`purchaseOrderInput` use `optionalUuid` (truck is optional here).

## Inventory side (Phase 2, Option B = per-truck ingredients + recipes)

**Schema:** `truck_id` on `ingredient`, `recipe`, `inventory_count`,
`inventory_usage`. **No `truck_stock` table** — on-hand stays on the
`ingredient` row, which is itself per-truck. Because each ingredient id belongs
to exactly one truck, anything keyed by `ingredientId` (usage, count lines,
on-hand updates) is **implicitly per-truck** already.

**Depletion (`lib/ops/depletion.ts`):** the key change is matching must be
**within a truck**. Recipes are grouped by `` `${truckId ?? "none"}|${normName}` ``
(`tnKey`), and a sale matches only its own truck's recipe of that name. The
idempotent delta-reconcile is unchanged (target − prior → adjust on-hand, upsert
ledger); usage rows now also store `truck_id` (from the sale's truck).

**Routers:** `inventory.list/summary/usage/listCounts` take optional `truckId`;
`create/update/createCount` persist it. `recipe.list` filters; `create/update`
persist. `truckId` is **required** in `ingredientInput`, `recipeInput`,
`inventoryCountInput` — so the forms must send it.

**Forms:**
- `ingredient-form`: required Truck `<select>` (defaults to `defaultTruckId`
  from `?truck=`).
- `recipe-form` + `inventory-count-form`: Truck is **controlled state**; the
  ingredient picker is `inventory.list({ truckId }, { enabled: Boolean(truckId) })`
  so it only shows that truck's ingredients. The count form resets its seeded
  counts when the truck changes.

**UI switcher:** `components/features/truck-scope-tabs.tsx` — a server component
rendering "All trucks | <each truck>" linking to `${basePath}?truck=<id>`.
Hidden when ≤1 truck. Used on Operations (P&L section), Inventory, Recipes,
Counts, Usage. Pages validate `?truck=` against the account's trucks, scope
their queries, and carry `?truck=` onto "Add"/sub-page links (→ form
`defaultTruckId`).

## Gotchas / invariants

- **Rollup is the absence of a filter** — never special-case "all"; just omit
  `truckId`.
- **Required vs optional `truckId`:** ingredient/recipe/count = required (a
  unit of a truck); expense/purchase = optional (business-wide allowed).
- **On-hand is not floored** by depletion; counts reconcile reality, and the
  count-vs-usage gap is shrink.
- **Real multi-location Square** maps every truck to the primary location for
  now (per-truck location picker deferred to live OAuth). Only the stub is truly
  multi-location today.
- **Migrations:** `0044` (money truck_id) + `0045` (inventory truck_id), both
  plain column adds (existing RLS policies already cover the new columns).

## Deferred follow-ups

"Copy menu/inventory to another truck" (kills duplicate setup for identical
menus — the main Option-B trade-off); per-truck Square location picker; scope
the purchase-order ingredient picker to its truck.
