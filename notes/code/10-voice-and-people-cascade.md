# Code 10 — Voice escalation + the person cross-truck cascade

Goal: read the two genuinely new bits of Phase 8 — a *conditional, send-time*
escalation channel, and a many-to-many cascade in the status engine.

Prereq: code notes 06 (dispatch), 08 (cascade engine), 09 (multichannel).

---

## 1. Voice: a channel that decides whether to fire at SEND time

SMS (note 09) was "another channel, scheduled like email." Voice is
different: the brief says call **only at the 7-day mark, Pro+, and only if
no prior reminder was acknowledged.** The first two are schedule-time facts;
the third is **not knowable until send time.** So the logic is split.

**Schedule time (`schedule.ts`)** — one targeted row, not a blanket channel:

```ts
const voiceEligible =
  !!acct && PLANS[acct.planTier].voiceEscalation && !!acct.smsPhone;
// …after email/sms rows…
if (voiceEligible) {
  for (const t of targets)
    if (t.kind === "expiry" && t.offsetDays === 7 && !taken.has("voice:expiry:7"))
      rows.push({ …, channel: "voice", … });
}
```

Note it is *not* added to the `channels` array (which fans out across every
target). Escalation is **one** call at exactly the 7-day expiry target —
modelled as a deliberate special case, not a uniform channel. `rows` is
explicitly typed `(typeof reminderDispatch.$inferInsert)[]` so pushing a
`"voice"` row past the `"email"|"sms"` flatMap typechecks.

**Send time (`dispatch.ts`)** — the conditional the schedule couldn't make:

```ts
if (d.channel === "voice") {
  if (!row.smsPhone) { await markSkipped(d.id, "No phone…"); continue; }
  const [prior] = await db.select({ id: reminderDispatch.id })
    .from(reminderDispatch)
    .where(and(
      eq(reminderDispatch.complianceItemId, d.complianceItemId),
      isNotNull(reminderDispatch.acknowledgedAt)))   // ANY prior ack
    .limit(1);
  if (prior) { await markSkipped(d.id, "Prior reminder already acknowledged"); continue; }
  const twiml = buildEscalationTwiml({ spoken, actionUrl:
    `${appUrl}/api/webhooks/twilio-voice?token=${createAcknowledgeToken(d.id)}` });
  await voice.call({ to: row.smsPhone, twiml });
}
```

The "did the user already acknowledge anything for this item?" check is one
indexed query at the moment of sending. Putting it here (not in
`schedule.ts`) is the whole design point: **schedule what's knowable early;
decide what's only knowable late, late.** `skipped` (with a reason), not
`failed` — a skipped escalation is correct behaviour, not an error.

## 2. The TwiML loop closes on the SAME token

`buildEscalationTwiml` emits `<Gather numDigits="1" action="…?token=T">`.
`T` is `createAcknowledgeToken(dispatchId)` — the *identical* signed token
from code note 05. `/api/webhooks/twilio-voice` does
`verifyAcknowledgeToken` → `acknowledgeDispatch`. So email links, SMS "OK",
and phone "press 1" are three transports into **one** idempotent function
that is still the only writer of `acknowledgedAt`. Adding a channel added
**zero** new ways to acknowledge — that's the invariant holding.

## 3. The person cross-truck cascade (`lib/status.ts`)

Commissary cascade (note 08) was one-to-many via a column on `truck`.
Person is **many-to-many** via the `person_truck` join, so it's one join
query feeding a map:

```ts
const personActive = await db
  .select({ personId: personTruck.personId,
            personName: person.name, truckName: truck.name })
  .from(personTruck)
  .innerJoin(person, eq(person.id, personTruck.personId))
  .innerJoin(truck,  eq(truck.id,  personTruck.truckId))
  .where(and(
    eq(personTruck.accountId, accountId),
    isNull(person.archivedAt),
    eq(truck.isActive, true),
    isNull(truck.archivedAt)));            // only ACTIVE, live trucks

const personTrucks = new Map<string, { personName; truckNames[] }>();
for (const r of personActive) { …group by personId… }

for (const u of urgencies) {
  const pid = u.item.personId;
  if (!pid || (!u.isExpired && !u.expiringSoon)) continue;
  const dep = personTrucks.get(pid);
  if (!dep?.truckNames.length) continue;
  if (u.isExpired) { u.contributesRed = true; red++; reasons.push(`… blocks ${dep.truckNames.join(", ")}`); }
  else             { yellow++; reasons.push(`… affects …`); }
}
```

Why this shape:

- **Filter trucks in SQL, not JS.** `isActive && !archived` is in the
  `WHERE` so the map only ever contains trucks a lapse should actually
  block. The cascade rule is expressed once, in the query.
- **Iterate the urgencies you already computed**, don't re-scan items. The
  per-item expired/expiring flags were computed earlier (note 08); the
  cascade just *reads* them and amplifies severity. Same "compute base →
  propagate" structure as the parent/commissary cascades.
- **`u.contributesRed = true`** so the dashboard badge for that cert turns
  red too — the UI and the count stay consistent.
- Severity mirrors commissary (expired→RED, ≤30d→YELLOW) on purpose: one
  mental model for every cascade in the app.

## 4. Why `person_truck` has no audit trigger

`venue` and `person` are first-class records → added to `audit_entity`,
reuse the Phase 2 trigger. `person_truck` is a **derived join**: the person
router deletes all of a person's links and re-inserts on every save
(`syncTrucks`). Auditing a wipe-and-rebuild would be noise, and the brief
allows hard-deleting such joins (same call as `reminder_dispatch`). The
*decision* (person changed their trucks) is captured by the audited
`person` update; the join is just its projection.

---

## 5. Build it yourself (exercise)

Make voice also fire at the **day-of** mark (offset 0), not just 7-day:

1. `schedule.ts`: change the voice loop condition to
   `t.offsetDays === 7 || t.offsetDays === 0` and the dedupe key to
   `voice:expiry:${t.offsetDays}`.
2. Realize the send-time "skip if prior ack" check needs no change — it's
   per-item, not per-offset. Good: the late decision composes.
3. `npm run typecheck`. Consider: should a day-of call skip if the 7-day
   *voice* call was acked? (It already does — `isNotNull(acknowledgedAt)`
   spans all channels for the item.)

## 6. Gotchas

- **Split early/late logic deliberately.** Anything depending on "has the
  user reacted yet?" must be a send-time check; scheduling it bakes in a
  stale answer.
- **Type the heterogeneous `rows` array** before pushing a different
  channel literal, or the `as const` flatMap inference rejects it.
- **Cascade filters belong in SQL.** Doing `isActive` in JS means the map
  carries trucks that shouldn't be flagged and every consumer must re-filter.
- **One acknowledge function, many transports.** Every new channel routes
  through `acknowledgeDispatch` via the signed token — never add a second
  writer of `acknowledgedAt`.
- **Derived joins ≠ audited entities.** Audit the decision (the `person`
  row), not its re-synced projection (`person_truck`).
