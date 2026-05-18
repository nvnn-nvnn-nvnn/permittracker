# Phase 6 — Explained (teaching walkthrough)

Dependencies & commissaries. Until now every compliance item stood alone.
Phase 6 makes things **affect each other**: a lapsed commissary can shut
down every truck based there, and an expired parent item drags its children
down with it.

---

## The two cascades

```
COMMISSARY cascade
  commissary.permit/contract expired
    → every ACTIVE truck whose commissary_id = it  → account RED
    (expiring ≤30d → YELLOW)

PARENT→CHILD cascade
  an item's parent item is expired
    → the child INHERITS "expired" (and RED if it's on an active truck)
    → propagates down chains until stable
```

Both are computed **server-side in `lib/status.ts`** — the dashboard never
trusts the client for this (same rule as every prior phase).

---

## 1. Commissary modelling (the chosen design)

A `commissary` is its **own table** with two date columns —
`permit_expiration` and `contract_expiration` — exactly matching the brief's
wording. We deliberately did **not** model commissary compliance as
ComplianceItems: that would be heavier and beyond the brief. Scope decision,
logged in `00-decisions.md`.

A truck gets an optional `commissary_id` FK (`onDelete: "set null"` — losing
a commissary shouldn't delete trucks). The column was *reserved in spirit*
since Phase 2's "optional commissary link"; now it's real.

Commissary reuses every existing pattern for free: account-scoped tRPC
router (list/byId/create/update/archive), `withActor` audit (added
`commissary` to the `audit_entity` enum + a trigger — same generic
`permitkeep_audit` function), RLS member-select policy, soft-delete. Nothing
new conceptually — that's the payoff of the Phase 2 foundations.

## 2. The commissary cascade (why RED)

A food truck legally **cannot operate** if the commissary it depends on has
a lapsed permit — same severity as the truck's *own* expired permit. So an
expired commissary permit/contract makes every dependent **active**,
non-archived truck count toward **RED** (your earlier choice); expiring
within 30 days → YELLOW. We only cascade through *active* trucks — an
inactive truck isn't serving, so its commissary lapse isn't an emergency.

The dashboard shows a dedicated "Commissary cascade" card listing which
commissary, which date, and **which trucks it blocks** — the operator needs
to know the blast radius, not just "something's red".

## 3. The parent→child cascade (inherit urgency)

`compliance_item.parent_item_id` (the self-FK reserved back in Phase 2) is
now used. If a parent item is expired, the child **inherits** that — even if
the child's own dates are fine — because a dependency that's dead makes the
thing depending on it effectively dead too. If the child is on an active
truck, that inherited-expired becomes RED, just like a first-class expiry.

**Implemented as three passes** in `computeAccountStatus`:

1. Compute each item's *base* urgency (no counting yet).
2. **Iterate** parent→child propagation until nothing changes — so a
   grandparent→parent→child chain fully cascades, not just one level. Bounded
   by `items.length + 1` iterations (can't loop forever).
3. Count RED/YELLOW/GREEN + build reasons from the *settled* state.

Splitting "compute" from "count" is the key trick: you can't count until
inheritance has settled, and you can't inherit cleanly while mutating
counters. Archived parents simply aren't in the map, so they naturally stop
a cascade (no special case needed).

## 4. Integrity (the usual rules, extended)

- `truck.commissaryId` must point to a commissary **in the same account**
  (`assertCommissaryInAccount`) — a client can't link across tenants.
- `item.parentItemId` must be an item in the same account and **not itself**
  (`assertParentItem`, with `selfId` on update). Deep-cycle prevention
  (A→B→A) is **deferred and documented** — the iteration is bounded so a
  cycle can't hang the server; it just won't produce a meaningful result.
  Logged as a known limitation.
- Everything still flows through tRPC + `withActor` + RLS. No new security
  surface — commissary is just another tenant table.

---

## Files that matter

- `lib/db/schema.ts` — `commissary` table, `truck.commissaryId`,
  `audit_entity += commissary`; migrations `0009` + custom `0010`.
- `lib/validators.ts` — `commissaryInput`, `truckInput.commissaryId`,
  `itemInput.parentItemId` (+ shared `optionalUuid`).
- `lib/trpc/routers/commissary.ts` — CRUD; truck/item routers gained the
  link validations.
- `lib/status.ts` — the three-pass engine + commissary cascade +
  `CommissaryAlert` / `blockedBy`.
- `components/features/commissary-form.tsx`, `app/(app)/commissaries/*` —
  UI; nav entry in `app-shell.tsx`; truck form commissary select; item form
  parent select; dashboard cascade card + ⛔ blocked-by line.

## How to demo Phase 6

1. **Commissaries → Add** one with **permit expiration = yesterday**.
2. **Trucks** → edit an active truck → set its **Commissary** to that one →
   save.
3. **Dashboard** → goes **RED** with a "Commissary cascade" card naming the
   truck it blocks.
4. Items → make item B's **"Depends on (parent item)"** = item A. Set item
   A's expiration to yesterday (A on an active truck).
5. Dashboard → item B shows **⛔ parent … expired** and is counted RED even
   though B's own date is fine. Archive/fix A → B clears.
