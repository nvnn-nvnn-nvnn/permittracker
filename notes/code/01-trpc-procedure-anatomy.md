# Code 01 — Anatomy of a tRPC procedure

Goal: understand exactly what happens, in code, when a user clicks
**"Add truck"** — from the browser to a row in Postgres with an audit entry.
If you understand this one path you understand ~70% of how the app's writes
work, because every mutation follows it.

---

## 1. The shape (pattern, no PermitKeep yet)

A **tRPC procedure** is just a backend function with three things bolted on:

```
publicProcedure
  .input(SCHEMA)        // 1. validate arguments
  .mutation(HANDLER)    // 2. the function body (a "query" if it only reads)
```

A **router** is an object grouping procedures. The client calls them by name
with full TypeScript types — no URLs, no fetch, no manual response typing.

"Procedure" = one callable backend operation.
"Mutation" = it changes data. "Query" = it only reads.

---

## 2. Line by line — `truck.create`

File: [`lib/trpc/routers/truck.ts`](../../lib/trpc/routers/truck.ts).

### The imports

```ts
import { z } from "zod";                       // runtime input validation
import { and, eq } from "drizzle-orm";         // SQL condition builders
import { TRPCError } from "@trpc/server";      // typed API errors
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb, withActor } from "@/lib/db";   // DB client + audit-txn helper
import { truck } from "@/lib/db/schema";       // the table definition
import { truckInput } from "@/lib/validators"; // the zod schema for input
```

`@/` is a path alias for the project root (configured in `tsconfig.json`), so
imports don't become `../../../lib/...`.

### The procedure

```ts
create: protectedProcedure
  .input(truckInput)
  .mutation(async ({ ctx, input }) => {
    return withActor(ctx.account.userId, async (tx) => {
      const [row] = await tx
        .insert(truck)
        .values({
          accountId: ctx.account.accountId,
          name: input.name,
          plateOrVin: input.plateOrVin,
          jurisdiction: input.jurisdiction,
          isActive: input.isActive ?? true,
          notes: input.notes,
          createdByUserId: ctx.account.userId,
        })
        .returning();
      return row;
    });
  }),
```

Now every token, in order:

- **`create:`** — the procedure's name. The client calls it as
  `trpc.truck.create` because the router is mounted under `truck` in
  [`lib/trpc/root.ts`](../../lib/trpc/root.ts).
- **`protectedProcedure`** — *not* `publicProcedure`. This is a procedure
  with a middleware pre-attached that throws `UNAUTHORIZED` if there's no
  logged-in user, and attaches `ctx.account` (the user's account, derived
  from their session cookie). Defined in
  [`lib/trpc/trpc.ts`](../../lib/trpc/trpc.ts). **This is the security
  chokepoint** — see §3.
- **`.input(truckInput)`** — before the handler runs, the incoming arguments
  are parsed by the `truckInput` zod schema
  ([`lib/validators.ts`](../../lib/validators.ts)). If the data is the wrong
  shape (missing name, name too long…), tRPC rejects it with a 400 and the
  handler never executes. `input` inside the handler is now fully typed *and*
  guaranteed valid.
- **`.mutation(async ({ ctx, input }) => { … })`** — the body. `mutation`
  (not `query`) signals "this writes". The handler receives a context object;
  we destructure:
  - **`ctx`** — request context built per call. `ctx.account` came from
    `protectedProcedure`'s middleware.
  - **`input`** — the validated arguments.
- **`withActor(ctx.account.userId, async (tx) => { … })`** — opens a database
  **transaction** and records *who* is acting so the audit trigger can stamp
  it (taught in detail in code note 02). Everything inside either all commits
  or all rolls back. `tx` is the transaction-scoped DB handle — use it, not
  the global `db`, inside here.
- **`tx.insert(truck).values({ … }).returning()`** — Drizzle's typed INSERT.
  `truck` is the table object; `.values()` is checked against the table's
  columns at compile time (wrong field name = red squiggle). `.returning()`
  asks Postgres to hand back the inserted row.
- **`const [row] = await …`** — `.returning()` yields an array; we
  destructure the first element. (Because `tsconfig` has
  `noUncheckedIndexedAccess`, `row` is typed `Truck | undefined` — callers
  must handle that. That strictness is deliberate.)
- **`accountId: ctx.account.accountId`** — the tenant id comes from the
  **session-derived context**, never from `input`. See §3; this is the most
  important line in the file.
- **`return row;`** — becomes the typed result the client receives.

---

## 3. Why each piece exists (remove it → what breaks)

| Remove this | What breaks |
|---|---|
| `protectedProcedure` → `publicProcedure` | Anyone unauthenticated can create trucks; `ctx.account` is undefined → crash or, worse, silent bad data. |
| `.input(truckInput)` | Garbage/oversized/malicious input reaches the DB; no type safety in the handler. |
| `accountId: ctx.account.accountId` (and instead trust `input.accountId`) | **Tenant isolation breaks.** A user could create rows in *another company's* account by sending a different id. This is the cardinal sin the brief calls out: never trust `account_id` from the client. |
| `withActor(...)` (use plain `db`) | The insert still works, but the audit trigger records actor = NULL ("system") — you lose "who did this". |
| `.returning()` | You can't return the created row to the client (no id to navigate to). |

The pattern in one sentence: **authenticate (protected), validate (input),
derive tenant from session (never input), write inside an attributed
transaction.** Every mutation in the app repeats exactly this.

---

## 4. The other half — calling it from the browser

File: [`components/features/truck-form.tsx`](../../components/features/truck-form.tsx).

```ts
const create = trpc.truck.create.useMutation({ onSuccess: onDone });
// ...
create.mutate(data, { onError });
```

- `trpc.truck.create` exists with full autocomplete because the client was
  generated from the *server's* `AppRouter` type — no codegen step, no
  hand-written API client. Rename `create` on the server → this line
  red-squiggles instantly.
- `useMutation` is the React Query wrapper: gives you `isPending`,
  `onSuccess`, `onError` for free.
- `create.mutate(data)` sends `data`; tRPC serializes it, the server
  re-validates with the same `truckInput` schema, runs the handler, returns
  the typed row.

The contract is defined **once** (the zod schema + the procedure) and both
ends obey it.

---

## 5. Build it yourself (exercise)

Add a `truck.rename` procedure (don't ship it — just to learn):

1. In `truck.ts`, add a procedure `rename` that `.input(z.object({ id:
   z.string().uuid(), name: z.string().min(1).max(120) }))`.
2. Make it `protectedProcedure`. First `getDb()`-select the truck `where id =
   input.id AND accountId = ctx.account.accountId` — if not found,
   `throw new TRPCError({ code: "NOT_FOUND" })`. (This is the ownership
   re-check pattern — knowing a UUID must not be enough to edit it.)
3. Then `withActor(ctx.account.userId, tx => tx.update(truck).set({ name:
   input.name }).where(eq(truck.id, input.id)).returning())`.
4. Run `npm run typecheck`. Notice the compiler guides you.

You've now written the full secure-mutation pattern yourself.

---

## 6. Gotchas (things that cost real time)

- **`ctx` vs `input`:** identity/tenant facts come from `ctx` (trustworthy,
  server-derived); user-supplied data comes from `input` (must be validated,
  never trusted for authz).
- **Use `tx`, not `db`, inside `withActor`.** Mixing the global `db` in
  means that statement runs *outside* the transaction and the audit-actor
  setting — silent correctness bug.
- **`noUncheckedIndexedAccess`:** `const [row] = await ….returning()` makes
  `row` possibly `undefined`. Handle it (`if (!row) throw …`) — the compiler
  forces you to, on purpose.
- **`query` vs `mutation`:** a read that you mark as `mutation` won't be
  cached by React Query and can't be prefetched in Server Components. Reads =
  `query`.
- **Errors:** throw `TRPCError` with a real `code` (`NOT_FOUND`,
  `FORBIDDEN`, `BAD_REQUEST`). The client can branch on `error.data.code`;
  a bare `throw new Error()` becomes an opaque 500.
