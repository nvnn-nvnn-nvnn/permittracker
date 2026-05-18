# Code 06 — Reminder scheduling & dispatch (implementation)

Goal: read the code that turns an item's offsets into scheduled rows
(`schedule.ts`), and the loop that actually sends them (`dispatch.ts`),
including the post-sign-off "catch-up" fix.

Prereq: code notes 01 (procedures/`withActor`), 05 (the token used in the
email).

---

## 1. The shape (pattern: derive, don't store; reconcile on change)

There is no "reminder schedule" table. The schedule is *derived* from the
item's own offsets every time the item changes. The pattern:

```
on item write  → recomputeDispatches(tx, item)  [SAME transaction]
                    delete future "scheduled" rows
                    rebuild them from offsets (+ fee rule)
cron / manual  → processDueDispatches()
                    find due "scheduled" rows → send → mark sent/failed/skipped
```

"Reconcile" = wipe the future plan, rebuild from current truth. Past/sent
rows are history and never touched.

---

## 2. `schedule.ts` — `recomputeDispatches`

File: [`lib/reminders/schedule.ts`](../../lib/reminders/schedule.ts).

```ts
export async function recomputeDispatches(
  tx: DbTx,
  item: Pick<ComplianceItem,
    "id"|"accountId"|"expirationDate"|"feeDueDate"|"reminderDaysBefore"|"archivedAt">,
): Promise<number> {
```

- **`tx: DbTx`** — it takes a *transaction handle*, not the global db. The
  caller (item create/update/archive, OCR apply — code note 01) runs it
  **inside the same `withActor` transaction** as the item write. That's why
  the item and its reminders can never disagree: they commit together.
- **`Pick<ComplianceItem, …>`** — it only needs six fields, so the signature
  asks for exactly those. Self-documenting + callable with a partial.

```ts
await tx.delete(reminderDispatch).where(and(
  eq(reminderDispatch.complianceItemId, item.id),
  eq(reminderDispatch.status, "scheduled")));

if (item.archivedAt || !item.expirationDate) return 0;
const expiration = item.expirationDate;   // non-null local for closures
```

- Delete **only `scheduled`** rows. `sent`/`failed`/`skipped` are history —
  untouched. This is the "rebuild the future, keep the past" rule in one
  query.
- Archived or no expiry date → nothing to schedule, return (the delete above
  already cleared pending ones — so archiving an item *cancels* its
  reminders, for free).
- **`const expiration = item.expirationDate`** — subtle but important:
  `item.expirationDate` is `Date | null`. We checked it's non-null, but TS
  loses that narrowing inside the `consider` **closure** below (object
  properties can be mutated, so the compiler won't assume it stays non-null
  across a function boundary). Copying to a `const` local keeps the narrowed
  `Date` type. (This exact error is in code note 02's spirit — the compiler
  protecting you; the fix is a local binding.)

```ts
const stillRelevant = expDay >= todayDay;   // both Date.UTC(y,m,d), date-only

const consider = (kind, offset) => {
  const when = atSendTime(expiration, offset);          // exp − offset @13:00 UTC
  if (when.getTime() > now) {
    targets.push({ kind, offsetDays: offset, scheduledFor: when });   // future → schedule
  } else if (stillRelevant) {
    targets.push({ kind, offsetDays: offset, scheduledFor: new Date() }); // past but not expired → CATCH-UP now
  }
  // else: item already expired → skip (dashboard owns "expired")
};
for (const offset of item.reminderDaysBefore ?? []) consider("expiry", offset);
if (item.feeDueDate) consider("fee", FEE_OFFSET_DAYS);
```

This little function is the whole scheduling brain, and the **catch-up fix**:

- send-time still in the future → schedule it for then (normal case).
- send-time already passed **but the item hasn't expired** → **clamp to
  `now`** so it goes out on the next cron tick / "Run now". This is the fix
  for "I added a permit expiring in 3 days with a 7-day reminder and got
  *nothing*" — before, that target was silently dropped.
- item itself already expired → skip; a late "expires soon" email would be
  wrong, and the dashboard's RED state already covers it.
- `consider` is reused for both the per-offset expiry reminders and the
  single 45-day `fee` reminder — one rule, no duplication.

```ts
// Skip targets already represented by a sent/failed/skipped row.
const taken = new Set(existing.map(e => `${e.kind}:${e.offsetDays}`));
const rows = targets.filter(t => !taken.has(`${t.kind}:${t.offsetDays}`)) …;
if (rows.length) await tx.insert(reminderDispatch).values(rows);
```

- Before inserting, drop any target that already has a *non-scheduled* row
  (already sent/failed/skipped). So re-saving an item doesn't re-send a
  reminder that already went out, and a catch-up that already sent won't be
  recreated. Dedupe key = `kind:offsetDays`.

Return value = number of rows created (handy for logging/tests).

---

## 3. `dispatch.ts` — `processDueDispatches`

File: [`lib/reminders/dispatch.ts`](../../lib/reminders/dispatch.ts).

```ts
export async function processDueDispatches(opts?: {
  accountId?: string; limit?: number;
}): Promise<DispatchSummary> {
  const where = [
    eq(reminderDispatch.status, "scheduled"),
    lte(reminderDispatch.scheduledFor, now),
  ];
  if (opts?.accountId) where.push(eq(reminderDispatch.accountId, opts.accountId));

  const due = await db.select({ dispatch:…, item:…, ownerEmail: appUser.email })
    .from(reminderDispatch)
    .innerJoin(complianceItem, eq(complianceItem.id, reminderDispatch.complianceItemId))
    .innerJoin(account, eq(account.id, reminderDispatch.accountId))
    .leftJoin(appUser, eq(appUser.id, account.ownerUserId))
    .where(and(...where)).orderBy(asc(reminderDispatch.scheduledFor)).limit(limit);
```

- One function, two callers: the Inngest cron (no `accountId` → all
  accounts) and the manual `reminder.runDueNow` tRPC (passes the caller's
  `accountId`). Same code path → identical behaviour. The `opts.accountId`
  filter is the *only* difference. (Same "cron + manual fallback" idea as the
  OCR run-now.)
- **`due`** = scheduled **and** `scheduledFor <= now`. A freshly-scheduled
  future row is correctly *not* selected — which, before the catch-up fix,
  is exactly why "no emails" happened (the row was 33 min in the future).
- Joins gather everything one query needs: the dispatch, its item, and the
  **account owner's email** (the recipient). `leftJoin` on `appUser` so a
  missing owner doesn't drop the row — we handle it explicitly.
- `limit` — process a batch, not unbounded, so a backlog can't make one
  cron run hang.

```ts
for (const row of due) {
  if (row.item.archivedAt) { mark "skipped"; continue; }      // archived since scheduling
  if (!row.ownerEmail)     { mark "failed: no owner email"; continue; }

  const { subject, html, text } = buildReminderEmail({
    item: row.item, dispatch: d,
    acknowledgeUrl: `${appUrl}/api/reminders/acknowledge?token=${createAcknowledgeToken(d.id)}`,
    itemUrl: `${appUrl}/items/${row.item.id}`,
  });
  try {
    await email.send({ to: row.ownerEmail, subject, html, text });
    mark "sent", sentAt;
  } catch (err) {
    mark "failed", error;
  }
}
```

- **Re-check `archivedAt` at send time**, not just at schedule time — an item
  could be archived in the window between. → `skipped`, no email.
- **`createAcknowledgeToken(d.id)`** — code note 05. The signed link is built
  per dispatch and embedded in the email URL.
- **`email.send`** is the adapter from code note "stack" (Resend live, or
  no-op). `processDueDispatches` has no idea which — that's the whole point
  of the adapter seam. Success → `sent`; throw → `failed` with the message
  (UI shows it; the Retry path can re-run).
- A `DispatchSummary` (`processed/sent/failed/skipped`) is returned so the
  manual trigger can show "Processed 3 · sent 2 · failed 0 · skipped 1".

```ts
export async function acknowledgeDispatch(dispatchId) {
  const [d] = await db.select()…where(eq(id, dispatchId));
  if (!d) return { ok:false, reason:"not_found" };
  if (d.acknowledgedAt) return { ok:true, alreadyAcked:true };   // idempotent
  await db.update(reminderDispatch).set({ acknowledgedAt: new Date() })…;
  await db.update(complianceItem).set({ updatedAt: new Date() })…; // nudge dashboards
  return { ok:true, alreadyAcked:false };
}
```

- Idempotent: double-click / link prefetch → "already acknowledged", no
  double write, no error.
- Bumps the item's `updatedAt` so the dashboard's "unacked > 48h → YELLOW"
  recomputes promptly after acknowledgement.
- This is the **only** writer of `acknowledgedAt` in the codebase (the brief
  rule, made structural — see code note 05 §3).

---

## 4. Build it yourself (exercise)

Add a second fee reminder (e.g. also 7 days before the fee due date):

1. In `schedule.ts`, after the existing `if (item.feeDueDate) consider("fee",
   FEE_OFFSET_DAYS);`, add another `consider("fee", 7)` — but note `consider`
   computes `when` from `expiration`, not `feeDueDate`. To do it properly
   you'd add a `from: Date` parameter to `consider`/`atSendTime`. Try it;
   `npm run typecheck` will keep you honest.
2. Observe the dedupe key is `kind:offsetDays` — your new fee target needs a
   distinct `offsetDays` or it collides with the 45-day one. (That's a real
   design constraint you just discovered by extending it.)

---

## 5. Gotchas

- **`recompute` must run in the caller's `tx`.** Pass the transaction handle;
  if you call it with the global `db` it commits separately from the item
  write and they can drift on failure.
- **Delete-only-`scheduled`** is load-bearing. Deleting sent rows too would
  erase history *and* let already-sent reminders re-fire.
- **Dedupe key = `kind:offsetDays`.** Two reminders of the same kind+offset
  can't coexist by design — fine for now, but know it before adding
  same-offset variants.
- **Due = `status scheduled AND scheduledFor <= now`.** New rows are future
  by definition; without the catch-up clamp, "fire it now to test" is
  impossible. That clamp is what makes the feature demoable *and* correct for
  urgent items.
- **Recipient = account owner.** Per-member / SMS / voice is Phase 7–8; the
  `reminder_channel` enum already exists so that's an additive change later.
