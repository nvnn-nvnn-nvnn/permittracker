# PermitKeep — Code Track (learn to build this yourself)

The `0N-phase-N-explained.md` notes explain **why** things are designed the
way they are. **This track explains the code itself** — line by line, the
patterns, and how you'd write it from scratch. Read a phase explainer for the
"why", then the matching code note here for the "how".

## How to read this track

Each note follows the same shape:

1. **The shape** — the pattern in the abstract, before any PermitKeep code.
2. **Line by line** — a real file from this repo, annotated.
3. **Why each piece exists** — what breaks if you remove it.
4. **Build it yourself** — a small exercise to reproduce the pattern.
5. **Gotchas** — the things that cost me time so they don't cost you.

You do **not** need to read these to use the app. They're for learning to
build it.

## Suggested learning path

If you're newer to this stack, read in this order — each builds on the last:

1. [`01-trpc-procedure-anatomy.md`](01-trpc-procedure-anatomy.md) — how one
   button click becomes a typed, secure, audited database write. The single
   most important pattern in the codebase.
2. [`02-drizzle-schema-and-sql.md`](02-drizzle-schema-and-sql.md) — defining
   tables in TypeScript, generating migrations, and the hand-written SQL
   (RLS policies, the audit trigger) we don't let the ORM manage.
3. [`03-server-vs-client-components.md`](03-server-vs-client-components.md) —
   what runs on the server, what runs in the browser, and how a page hands
   data from one to the other.

**Foundations (1–3) teach the patterns. The next ones dissect real feature
implementations using those patterns:**

4. [`04-ocr-extraction-pipeline.md`](04-ocr-extraction-pipeline.md) — force
   an LLM into a typed form, then distrust every field (Phase 3).
5. [`05-signed-tokens.md`](05-signed-tokens.md) — HMAC-signed,
   stateless one-click links; prove a click without a login (Phase 4).
6. [`06-reminder-scheduling-and-dispatch.md`](06-reminder-scheduling-and-dispatch.md)
   — derive a schedule instead of storing one; the send loop + catch-up
   (Phase 4).
7. [`07-stripe-webhook-and-limits.md`](07-stripe-webhook-and-limits.md) —
   signed webhook as source of truth, price lookup-keys, limits as
   un-skippable tRPC middleware (Phase 5).
8. [`08-cascade-status-engine.md`](08-cascade-status-engine.md) —
   multi-pass fixpoint: compute → propagate dependencies → count;
   commissary + parent→child cascades (Phase 6).

More notes get added as phases progress (one per phase's key new pattern).
Read 1–3 for the transferable patterns; 4+ to see them combined in anger.

## Playbooks (concept-first — rebuild from memory)

Deeper, provider-conceptual write-ups for systems worth reconstructing
without notes. The numbered notes show *our lines*; a playbook teaches the
*model*.

- [`stripe-billing-playbook.md`](stripe-billing-playbook.md) — subscription
  billing from first principles: the seven nouns, the canonical flow, the
  four hard rules, the `lookup_key` trick, a rebuild-from-scratch checklist.
  Pair with `07-stripe-webhook-and-limits.md`.

## Prerequisites (just enough to follow along)

- **TypeScript basics:** types, generics (`Foo<T>`), `async/await`. You don't
  need to be expert; the notes explain the fancy bits inline.
- **What a database is:** tables, rows, columns, a primary key. SQL is
  taught as it appears.
- **React basics:** a component is a function returning markup; "state" is
  data that changes and re-renders. Server Components are explained from
  scratch in note 03.

## Mental model of the whole stack (one diagram)

```
Browser (React)
  │  user types / clicks
  ▼
Client Component  ── calls ──►  tRPC procedure  (typed function over HTTP)
  ▲                                  │
  │ rendered HTML                    │  validates input (zod)
  │                                  │  derives account from session
Server Component ◄── reads ──── tRPC / lib query
  ▲                                  │  withActor() opens a txn
  │                                  ▼
  └──────────────────────────  Drizzle ORM ──► Postgres (Supabase)
                                                  │  RLS + audit trigger
                                                  ▼  enforce, can't be bypassed
```

Every code note zooms into one arrow of that diagram.

## Glossary (terms used across the notes)

- **ORM** (Drizzle): write DB queries as typed TS instead of raw SQL strings.
- **Migration:** a versioned SQL file that evolves the DB schema over time.
- **RLS (Row Level Security):** Postgres rules deciding which rows a
  connection may see — enforced by the DB, not the app.
- **Trigger:** SQL that auto-runs on insert/update/delete of a table.
- **tRPC procedure:** a backend function the typed client calls by name.
- **RSC (React Server Component):** a component that runs only on the server
  and ships zero JS for itself.
- **Transaction (`tx`):** a group of DB writes that all succeed or all
  roll back together.
