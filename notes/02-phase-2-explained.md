# Phase 2 — Explained (teaching walkthrough)

A plain-language tour of *what* we built, *why*, and *how* it fits together.
Read top to bottom; each section builds on the last.

---

## The mental model

Phase 1 was the empty building: doors (auth), rooms (routes), security
(RLS). Phase 2 puts the actual product inside: **trucks**, the
**compliance items** that can shut them down, a **dashboard** that screams
when something's wrong, and a tamper-proof **audit log** that records every
change.

Data flows in one direction, always:

```
Browser form (client)
   → tRPC mutation  (the ONLY write path; account derived from session)
      → withActor()  (opens a DB transaction, stamps "who did this")
         → Drizzle write to truck / compliance_item
            → Postgres TRIGGER fires → writes an audit_log row
Server Component (read)
   → serverApi() (same tRPC procedures, no duplicate SQL)
      → Drizzle read, always filtered by account_id
```

---

## 1. The data model (`lib/db/schema.ts`)

**What:** three new tables — `truck`, `compliance_item`, `audit_log` — plus
enums (`item_type`, `item_status`, `holder_type`, `audit_action`,
`audit_entity`).

**Why these shapes:**

- **`compliance_item` is polymorphic.** Permits, inspections, certs, COIs and
  vehicle items are all *the same shape* (they expire, have a fee, a
  jurisdiction, a holder), so one table with an `item_type` discriminator beats
  five near-identical tables. Less code, one status engine, one reminder
  engine later.
- **Money is `fee_amount_cents` (integer), never a float.** `0.1 + 0.2` is
  not `0.3` in floating point. Currency in cents = exact integers.
- **Dates use `date` (no time zone).** A permit expires *on a day*, not at a
  microsecond. Mixing time zones into "expiration day" causes off-by-one bugs.
- **`holder_type` + `holder_truck_id` + `holder_name`.** An item can belong to
  a truck (FK), or to a person/business (just a name for now — Person is a
  Phase 8 entity). Modeling the FK now, the name as a placeholder, avoids a
  schema rewrite later.
- **`parent_item_id` self-reference.** Phase 6 needs dependency chains
  (commissary → trucks). The column exists now so we don't migrate again; it's
  simply unused until then.
- **Soft delete only:** `archived_at` timestamp. The brief forbids hard
  deletes — the audit trail must survive. "Delete" = set `archived_at`.

**How:** Drizzle column builders; `defaultRemindersFor()` (in
`lib/validators.ts`) seeds per-type reminder offsets. Migration generated with
`npm run db:generate` → `0002_pink_dragon_lord.sql`.

> Scope note (not a stack deviation): per-item reminder offsets are stored as
> an `int[]` column for now. The full `ReminderSchedule` / `ReminderDispatch`
> tables are Phase 4 — building them now would be speculative.

---

## 2. The append-only audit log (`0003_audit_and_rls.sql`)

**What:** two Postgres trigger functions + four triggers.

1. `permitkeep_audit()` — fires `AFTER INSERT OR UPDATE` on `truck` and
   `compliance_item`. It writes one `audit_log` row capturing the old value,
   the new value, the action, and *who did it*.
2. `permitkeep_audit_block()` — fires `BEFORE UPDATE OR DELETE` on
   `audit_log` itself and immediately `RAISE EXCEPTION`. History cannot be
   altered or erased — **not even by our own server / the service role.**

**Why a database trigger instead of app code:** application logging can be
forgotten on a new code path, bypassed by a bug, or skipped by a direct SQL
fix. A trigger is unconditional — *every* write goes through it, including
ones we didn't anticipate. The brief lists "never write to audit_log except
via the trigger" and "audit trail must survive" as hard rules; the only way to
*guarantee* that is to enforce it in the database, below the app.

**How "who did it" works (the tricky part):** a trigger has no idea who the
logged-in user is — it only sees the row. So before each write we set a
**transaction-local** Postgres variable:

```
select set_config('permitkeep.actor_id', '<user-uuid>', true)  -- true = tx-local
... then INSERT/UPDATE the row in the SAME transaction ...
```

The trigger reads `current_setting('permitkeep.actor_id')`. Because it's
transaction-local, it can never leak across pooled connections to another
user. This is wrapped in one helper, `withActor()` in `lib/db/index.ts`, and
**every** mutation must use it.

**Proven, not assumed.** We ran a live test (insert a truck → confirm an
audit row appears with the right actor → attempt UPDATE and DELETE on
`audit_log` → both rejected with the append-only error), all inside a
rolled-back transaction so no test data persisted. Result: all four checks
green.

---

## 3. tRPC routers (`lib/trpc/routers/truck.ts`, `item.ts`)

**What:** `list / byId / create / update / archive` for each entity.

**Why / the rules baked in:**

- **`account_id` is never trusted from the client.** It comes from
  `ctx.account` which is derived from the Supabase session (Phase 1). The
  client literally cannot ask for another tenant's data.
- **Ownership re-check before every update/archive.** Even though the list is
  account-scoped, `update`/`archive` first `SELECT ... WHERE id = ? AND
  account_id = ?`. Knowing an item's UUID is not enough to touch it.
- **No hard delete.** `archive` sets `archived_at`; the row (and its history)
  stays forever.
- **Writes go through `withActor()`** so the audit trigger attributes them.
- **Cross-entity integrity:** attaching an item to a truck verifies that
  truck is in the same account (`assertTruckInAccount`).

**How reads avoid duplication:** Server Components call the *same* procedures
via `serverApi()` (`lib/trpc/server.ts`, a tRPC server-side caller). One
definition of "list trucks for this account" — used by both the HTTP API and
server rendering.

---

## 4. The status engine (`lib/status.ts`)

**What:** `computeAccountStatus(accountId)` → `red | yellow | green` plus a
per-item urgency list, computed **entirely on the server**.

**Why server-side:** the brief is explicit — "Compute this server-side. Don't
trust the client." A food truck's legal status is not something a browser
should be able to fake.

**The rules (straight from the brief):**

- **RED** — an item is *expired* **and** it's tied to a truck that is
  *active and not archived*. (You legally can't serve on that truck.)
- **YELLOW** — anything expiring within 30 days, OR a fee due within 14 days,
  OR an expired item that isn't RED-qualifying. (The "unacknowledged reminder
  > 48h" clause is intentionally deferred — reminders don't exist until
  Phase 4; noted in code.)
- **GREEN** — none of the above.

**How dates are compared safely:** `dayDiff()` reduces both "today" and the
target to a UTC day number and subtracts. No hours, no time-zone drift, no
off-by-one. Each item also gets a `rank` so the dashboard can sort
"what bites you first" (RED → expired → expiring soon → fee due → fine).

`classifyItem()` is a tiny pure version used for list-row badges, so the
dashboard and the items list show consistent labels without duplicated logic.

---

## 5. The UI

**What:** Trucks (list / add / edit+archive), Items (list / add /
detail+edit+archive+audit trail), Dashboard (status banner + urgency list).

**Why this structure:**

- **Server Components fetch; Client Components mutate.** Pages are server
  components (fast, no JS to list data). Forms (`truck-form`, `item-form`,
  `archive-button`) are client components that call tRPC mutations, then
  invalidate the cache and refresh. This matches the brief's "Server
  Components by default; every mutation through tRPC."
- **Mobile-first.** Single-column forms, the item grid collapses to one
  column under `sm:`. Test target stays 375px.
- **Archive is a two-tap confirm**, never a one-click destructive action, and
  it's soft — consistent with "never hard-delete."
- **The item detail page shows the live audit trail** and states plainly that
  it's trigger-written and immutable — so the guarantee is visible, not just
  claimed.

**Small additions (within shadcn conventions, not stack deviations):**
`components/ui/textarea.tsx`, `components/ui/badge.tsx`, plus
`lib/format.ts` (date/money formatting) and `lib/jurisdictions.ts` reused for
the MN datalist.

---

## What's deferred (and why that's correct)

- Real `ReminderSchedule` / `ReminderDispatch` tables + sending → **Phase 4**.
- Person/Commissary/Venue entities + dependency cascades → **Phase 6/8**.
- OCR pre-fill of items → **Phase 3**.
- The "unack reminder > 48h" YELLOW clause → **Phase 4** (no reminders yet).

Building these now would be guessing ahead of their phase. The columns/edges
that *would* force a painful migration later (parent item id, holder model,
reminder offsets) are already in place.

---

## How to demo Phase 2

1. Trucks → **Add truck** (mark it Active).
2. Items → **Add item**: type = permit, attach to that truck, set the
   **expiration date to yesterday**. Save.
3. Dashboard → it's now **RED** ("expired item on an active truck").
4. Edit the truck → uncheck Active → Dashboard drops to **YELLOW**
   (still a problem, just not a "can't serve today" one).
5. Open the item → see the **audit trail** rows (insert + each update),
   written by the trigger, which the app cannot edit or delete.
