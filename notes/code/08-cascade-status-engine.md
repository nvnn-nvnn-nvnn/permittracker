# Code 08 — The cascade status engine (implementation)

Goal: read the code that makes one thing's expiry affect another — the
commissary cascade and parent→child inheritance in `lib/status.ts`. This is
a pure-computation pattern worth being able to reproduce.

Prereq: code note 02 (schema/FKs). No new framework concepts — just careful
algorithm structure.

---

## 1. The shape (pattern: multi-pass fixpoint, then count)

When derived state depends on *other* derived state, you cannot compute and
tally in one loop. The pattern:

```
pass 1: compute each node's BASE state            (no side effects)
pass 2: propagate dependencies until STABLE        (a fixpoint loop)
pass 3: now that it's settled, COUNT / summarize
```

Mixing these (mutating counters while still propagating) gives wrong totals
and order-dependent bugs. Separation is the whole trick.

---

## 2. Why three passes (the bug you avoid)

Naive version: one `.map()` that computes urgency *and* `red++`. It breaks
the moment a child's RED-ness depends on its parent: when you process the
child you may not have processed the parent yet, and you've already
incremented counters you'd need to take back. So:

```ts
// PASS 1 — base urgency, NO counting
const base: ItemUrgency[] = items.filter(notArchived).map(item => {
  …compute isExpired / expiringSoon / feeDueSoon / contributesRed…
  return { …, blockedBy: null };
});
const byId = new Map(base.map(u => [u.item.id, u]));
```

`rankOf(u)` is factored out as a pure function because rank must be
**recomputed** after inheritance changes a node — defining it once avoids
the two copies drifting.

---

## 3. The fixpoint loop (handles chains, can't hang)

```ts
for (let iter = 0; iter < base.length + 1; iter++) {
  let changed = false;
  for (const u of base) {
    const p = u.item.parentItemId ? byId.get(u.item.parentItemId) : null;
    if (!p) continue;
    if (p.isExpired && !u.isExpired) {
      u.isExpired = true;
      u.blockedBy = `parent ${p.item.itemType} expired`;
      u.contributesRed = u.item.holderType === "truck" && u.truckActive;
      u.rank = rankOf(u);
      changed = true;
    } else if (p.expiringSoon && !u.expiringSoon && !u.isExpired) {
      u.expiringSoon = true; u.blockedBy = `parent … expiring soon`;
      u.rank = rankOf(u); changed = true;
    }
  }
  if (!changed) break;
}
```

Three things to notice:

- **Why a loop, not one pass:** a grandparent→parent→child chain needs the
  parent to become expired *first*, then the child sees it on the next
  iteration. One pass would only cascade one level deep.
- **Termination is guaranteed two ways:** each change only ever flips flags
  *on* (monotonic — a node can't toggle back), so it converges; and the loop
  is hard-capped at `base.length + 1`. Even a malicious A→B→A cycle can't
  hang the request — it just stops with a bounded, harmless result. (Deep
  cycle *prevention* is deferred; this bound is why that's safe to defer.)
- **Archived parents stop the cascade for free:** `base` only contains
  non-archived items, so an archived parent isn't in `byId` → `p` is null →
  no propagation. No special-case branch needed; the data shape does it.

`changed`/`break` is the standard fixpoint idiom: keep sweeping until a full
pass changes nothing.

---

## 4. Count last

```ts
for (const u of base) {
  if (u.contributesRed) { red++; reasons.push(`… ${u.blockedBy ?? "expired"} …`); }
  else if (u.isExpired || u.expiringSoon || u.feeDueSoon) yellow++;
  else green++;
}
const urgencies = base.sort((a,b) => a.rank - b.rank);
```

Only now — state fully settled — do we tally and build human reasons. The
reason string folds in `blockedBy` so the dashboard explains *why*
("(parent permit expired) on active truck X") instead of a bare "expired".

---

## 5. The commissary cascade (a join in memory)

```ts
const activeTrucks = trucks.filter(t => t.isActive && !t.archivedAt && t.commissaryId);
const dependents = new Map<string,string[]>();      // commissaryId → truck names
for (const t of activeTrucks) push(dependents, t.commissaryId!, t.name);

for (const [commId, truckNames] of dependents) {
  const c = commById.get(commId);
  if (!c || c.archivedAt) continue;
  for (const kind of ["permit","contract"] as const) {
    const d = dayDiff(kind === "permit" ? c.permitExpiration : c.contractExpiration);
    if (d === null) continue;
    if (d < 0)      { red++;    alerts.push({…expired:true…});  reasons.push(`… blocks ${truckNames}`); }
    else if (d<=30) { yellow++; alerts.push({…expired:false…}); }
  }
}
```

- We **invert** the relationship once: instead of "for each commissary find
  its trucks" (N queries), build a `commissaryId → [truckNames]` map from the
  trucks we already loaded. One in-memory group-by, zero extra DB round
  trips. (We already had all trucks + commissaries in memory; use them.)
- Only **active, non-archived** trucks create a dependency — an idle truck's
  commissary lapse isn't an operational emergency.
- The alert carries `truckNames` so the UI can show blast radius, not just a
  red dot. Surfacing *who is affected* is a product decision encoded in the
  data the engine returns.

`dayDiff` (date-only, UTC) is the same helper used everywhere — one
definition of "days until", reused, so commissary/expiry/fee math can't
disagree.

---

## 6. Build it yourself (exercise)

Add a "person certification expired → blocks their assigned trucks"
cascade (a Phase 8 idea, but the shape is identical):

1. After the commissary block, group items where `holderType === "person"`
   and `isExpired` by the trucks that person is assigned to.
2. For each affected active truck, `red++` and push a reason +
   alert-like record.
3. Notice you're reusing the *exact* invert-then-scan structure from §5 —
   that's the transferable pattern, not the commissary specifics.

---

## 7. Gotchas

- **Never count during propagation.** Compute → fixpoint → count. Violating
  this is the #1 cascade bug.
- **Make propagation monotonic** (only flip flags toward "worse"). If a rule
  could flip a flag back, you can oscillate and never converge — then the
  iteration cap just hides a logic error.
- **Always bound the fixpoint loop.** Even with monotonic rules, a cap is
  cheap insurance against a data shape you didn't foresee (cycles).
- **Recompute derived fields (`rank`) after a node changes** — stale rank =
  wrong dashboard sort. Factor the recompute into one pure function.
- **Filter to non-archived once, early.** Letting archived rows into the map
  silently resurrects dead dependencies.
- **Invert relationships in memory** when you already hold both sides — a
  per-parent DB query inside a loop is the classic N+1.
