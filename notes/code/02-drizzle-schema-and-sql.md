# Code 02 — Drizzle schema, migrations, and the SQL we hand-write

Goal: understand how a database table goes from a TypeScript definition to a
real Postgres table, and *why* some SQL (security rules, the audit trigger)
is written by hand instead of by the ORM.

Read code note 01 first — this explains the `truck` table that note's
`insert` writes to.

---

## 1. The shape (pattern)

Three layers, each with a job:

```
lib/db/schema.ts        TypeScript description of tables  (source of truth)
        │  drizzle-kit generate  (diff schema vs last snapshot → SQL)
        ▼
supabase/migrations/*   versioned .sql files              (what actually runs)
        │  drizzle-kit migrate   (apply un-applied files, in order)
        ▼
Postgres (Supabase)     real tables + our hand-written RLS/triggers
```

Rule of thumb: **structure** (tables, columns, indexes) → let Drizzle
generate it. **Behaviour/security** (row-level security, triggers) → hand
write it as a "custom" migration, because an ORM can't express it and must
never drop it.

---

## 2. Defining a table — `truck`

File: [`lib/db/schema.ts`](../../lib/db/schema.ts).

```ts
export const truck = pgTable(
  "truck",
  {
    id: uuid("id").primaryKey().default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    plateOrVin: text("plate_or_vin"),
    jurisdiction: text("jurisdiction"),
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(
      () => appUser.id, { onDelete: "set null" }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("truck_account_idx").on(t.accountId)],
);
```

Token by token:

- **`pgTable("truck", { … }, (t) => [ … ])`** — declares a Postgres table.
  Arg 1 = SQL table name. Arg 2 = columns. Arg 3 = table-level extras
  (indexes, unique constraints).
- **`uuid("id")`** — a TS property `id` mapping to SQL column `id` of type
  `uuid`. The TS name (camelCase) and SQL name (snake_case) are intentionally
  decoupled — your code reads `truck.createdByUserId`, the DB has
  `created_by_user_id`.
- **`.primaryKey()`** — the unique row identifier.
- **``.default(sql`gen_random_uuid()`)``** — the DB generates the id. ``sql`…` ``
  drops to raw SQL for things the typed builder can't express.
- **`.notNull()`** — column is required (compile-time enforced on insert too).
- **`.references(() => account.id, { onDelete: "cascade" })`** — a foreign
  key: every truck must point to a real account; delete the account → its
  trucks delete too. `() => account.id` is a lazy thunk so tables can
  reference each other regardless of file order.
- **`onDelete: "set null"`** on `createdByUserId` — if the creating user is
  removed, keep the truck but null the creator (don't cascade-delete trucks
  because an employee left).
- **`archivedAt` timestamp, nullable** — this is the *soft delete*. "Delete"
  = set this column; the row (and its audit trail) survives. The brief
  forbids hard deletes here.
- **`...timestamps`** — a shared object (`createdAt`, `updatedAt`) spread into
  every table so the convention is defined once, not copy-pasted.
- **`(t) => [index("truck_account_idx").on(t.accountId)]`** — an index on
  `account_id`. Every query filters by account; without the index those
  scans get slow as data grows.
- **`export const truck`** — exporting it lets routers do
  `tx.insert(truck)` with full typing, and lets us derive the row type:
  `export type Truck = typeof truck.$inferSelect;`.

---

## 3. Generating & applying migrations

You never write the structural SQL by hand. Two npm scripts (defined in
`package.json`, config in `drizzle.config.ts`):

```bash
npm run db:generate   # diff schema.ts vs the last snapshot → new .sql file
npm run db:migrate    # run any migration files not yet applied, in order
```

`drizzle-kit` keeps a `meta/_journal.json` + snapshot so it knows what's
already applied — like git for your schema. A generated file looks like:

```sql
CREATE TABLE "truck" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "account_id" uuid NOT NULL,
  ...
);
ALTER TABLE "truck" ADD CONSTRAINT "truck_account_id_account_id_fk"
  FOREIGN KEY ("account_id") REFERENCES "account"("id") ON DELETE cascade;
```

That's just the literal translation of the TS above. Nothing surprising —
which is the point.

---

## 4. The SQL we DON'T let the ORM manage

Two things an ORM can't express, created as **custom** migrations
(`npm run db:generate -- --custom --name xyz` makes an empty journaled file
we fill in):

### a) Row Level Security — `0001_rls.sql`, `0003`, `0005`, `0007`

```sql
ALTER TABLE public.truck ENABLE ROW LEVEL SECURITY;

CREATE POLICY truck_member_select ON public.truck
  FOR SELECT TO authenticated
  USING (public.permitkeep_is_member(account_id));
```

- `ENABLE ROW LEVEL SECURITY` — once on, with **no** matching policy a row is
  invisible. Default-deny.
- The `POLICY` says: an `authenticated` (logged-in, non-service) connection
  may `SELECT` a truck row only if `permitkeep_is_member(account_id)` is true
  — i.e. the user belongs to that truck's account.
- This is enforced **inside Postgres**. Even if app code forgot its
  `WHERE account_id = …`, the database still won't leak another tenant's
  rows. Defense in depth. (The server's service-role connection bypasses RLS
  by design; that's why all writes go through tRPC, which always scopes by
  the session account — see code note 01 §3.)

### b) The audit trigger — `0003_audit_and_rls.sql`

A **trigger** is SQL that fires automatically on a table write. Ours:

```sql
CREATE OR REPLACE FUNCTION public.permitkeep_audit()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_actor uuid; v_action public.audit_action;
BEGIN
  v_actor := nullif(current_setting('permitkeep.actor_id', true), '')::uuid;
  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log(account_id, actor_user_id, action, entity_type,
                          entity_id, prior_value, new_value)
    VALUES (NEW.account_id, v_actor, 'insert', TG_ARGV[0]::audit_entity,
            NEW.id, NULL, to_jsonb(NEW));
  ELSIF TG_OP = 'UPDATE' THEN
    -- ...prior_value = to_jsonb(OLD), new_value = to_jsonb(NEW)...
  END IF;
  RETURN NEW;
END; $$;

CREATE TRIGGER truck_audit
  AFTER INSERT OR UPDATE ON public.truck
  FOR EACH ROW EXECUTE FUNCTION public.permitkeep_audit('truck');
```

Why this *must* be in the database, not app code:

- It fires on **every** write to `truck`/`compliance_item`/`file_attachment`
  — even a write from a path you forgot, or a manual SQL fix. App-level
  logging can be skipped; a trigger cannot.
- `current_setting('permitkeep.actor_id')` is the bridge to "who did it":
  `withActor()` (code note 01) ran `set_config('permitkeep.actor_id', userId,
  true)` in the same transaction; the trigger reads it back. `true` =
  transaction-local so it can't leak across pooled connections.
- A companion trigger `permitkeep_audit_block()` is `BEFORE UPDATE OR DELETE
  ON audit_log` and just `RAISE EXCEPTION` — so the log is **append-only for
  everyone, including us**. We proved this with a live test in Phase 2.

`SECURITY DEFINER` + `SET search_path` = it runs with the function owner's
rights against a fixed schema, so a low-privilege caller still gets audited
and the definer can't be tricked into a malicious `audit_log`.

### c) Why writes inside `withActor` MUST use `tx`, not the global `db`

The audit trigger above only works because `withActor` opens **one transaction**
and pins the actor as a *transaction-local* Postgres setting
(`set_config('permitkeep.actor_id', userId, true)` — the trailing `true` is
the magic word: this value lives **only** inside that transaction, on that
connection). The `tx` argument handed to the closure is that transaction's
own handle:

```ts
await withActor(ctx.account.userId, async (tx) => {
  await tx.update(complianceItem).set({ … }) …  // ✅ same transaction → audited as user
});
```

If you mix in the global `db` inside the closure — for example
`await getDb().update(complianceItem)…` — **three things go wrong, all of
them silent**:

1. **The audit row records the actor as `NULL` ("system did it").** The
   sticky note only exists on the `tx` transaction's connection. A query
   issued through `db` runs on a **different** pooled connection that has
   no sticky note. The trigger still fires (it always does), reads an
   empty `permitkeep.actor_id`, and stamps `actor_user_id = NULL`. Your
   "who did this?" guarantee is gone for that row — not loudly, just
   wrong.
2. **The write escapes rollback.** The point of `withActor` is "all of
   these changes commit together, or none of them do." A `db` write is a
   separate autocommitted statement on a separate connection — it has
   **already committed** by the time your closure throws. Rollback can't
   reach it, so a partial state survives: e.g. an `extraction_cost` row
   billed with no `extraction_proposal` to point at, or
   `file.status = 'extracted'` with no proposal row beneath it.
3. **Snapshot drift inside the closure.** Postgres gives each transaction
   its own visibility snapshot. A `tx.insert(...)` is **invisible** to a
   sibling `db.select(...)` until `tx` commits, so a "read what I just
   wrote" pattern silently misses the row. You'll debug it as an
   `await`-ordering bug for an hour before realising it's actually two
   transactions not seeing each other.

The rule, stated as a single sentence so future-you doesn't forget:
**inside `withActor(ctx.account.userId, async (tx) => { … })`, every DB
call in the closure must go through `tx` — never the global `db`. Reads
too, if they need to see writes made earlier in the same closure.**

The codebase enforces this by convention, not by the compiler — `db` is
still importable inside the closure. This is exactly the kind of bug a
test in the §7 launch-checklist suite should pin down (a deliberately-
failing mutation that asserts the row never lands).

---

## 5. Build it yourself (exercise)

Add a `color text` column to `truck`:

1. Add `color: text("color")` to the `truck` table in `schema.ts`.
2. `npm run db:generate` → open the new file in `supabase/migrations/`. See
   the single `ALTER TABLE "truck" ADD COLUMN "color" text;`. *Read it* — you
   now know exactly what will run.
3. `npm run db:migrate` (DB reachable) → column exists.
4. Revert (remove the column, generate again) to see Drizzle emit the
   `DROP COLUMN`. This is how you learn to trust the diff.

Never hand-edit an already-applied migration; add a new one.

---

## 6. Gotchas

- **Enum value added + used in the same migration → Postgres error.** You
  cannot `ALTER TYPE … ADD VALUE` and then use that value in the same
  transaction. We add the value in one migration (`0004`) and the trigger
  that uses it in the next (`0005`). Bit me; now you know.
- **RLS default-deny surprises you:** enable RLS, forget a policy → "no rows"
  with no error. That's working as designed; you owe every table its policy.
- **The service role bypasses RLS.** RLS is a safety net for stray
  anon/authenticated access, *not* your primary authorization — the tRPC
  account scoping (code note 01) is. Both, always.
- **`drizzle-kit` won't drop your custom SQL** because custom migrations
  aren't part of the schema diff — but don't rename/rewrite an applied one;
  the journal tracks it by tag.
- **camelCase ↔ snake_case:** `truck.createdByUserId` in TS is
  `created_by_user_id` in SQL. Raw SQL (psql, the trigger) uses snake_case;
  Drizzle code uses camelCase. Mixing them up = "column does not exist".
