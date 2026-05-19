import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DbTx } from "@/lib/db";
import { account, reminderDispatch } from "@/lib/db/schema";
import type { ComplianceItem } from "@/lib/db/schema";
import { PLANS } from "@/lib/stripe";

/** Fee reminder fires this many days before expiration (brief default). */
const FEE_OFFSET_DAYS = 45;
/** Send time-of-day (UTC) for a scheduled reminder. */
const SEND_HOUR_UTC = 13;

function atSendTime(dateOnly: Date, offsetDays: number): Date {
  const d = new Date(dateOnly);
  d.setUTCDate(d.getUTCDate() - offsetDays);
  d.setUTCHours(SEND_HOUR_UTC, 0, 0, 0);
  return d;
}

interface Target {
  kind: "expiry" | "fee";
  offsetDays: number;
  scheduledFor: Date;
}

/**
 * Recompute the reminder_dispatch rows for one item from its own offsets
 * (reminder_days_before) + the fee rule. Called after every item create/
 * update inside the SAME transaction.
 *
 * Rules:
 *  - Only future sends are created (don't spam reminders whose date already
 *    passed when an item is back-dated).
 *  - We replace only still-`scheduled` rows; `sent`/`failed`/`skipped` rows
 *    are history and are preserved. A target that already has a non-scheduled
 *    row (same kind+offset) is not recreated.
 *  - Archived item or no expiration date → clear pending sends.
 */
export async function recomputeDispatches(
  tx: DbTx,
  item: Pick<
    ComplianceItem,
    | "id"
    | "accountId"
    | "expirationDate"
    | "feeDueDate"
    | "reminderDaysBefore"
    | "archivedAt"
  >,
): Promise<number> {
  // Always clear existing still-scheduled rows; we rebuild them.
  await tx
    .delete(reminderDispatch)
    .where(
      and(
        eq(reminderDispatch.complianceItemId, item.id),
        eq(reminderDispatch.status, "scheduled"),
      ),
    );

  if (item.archivedAt || !item.expirationDate) return 0;
  // Local non-null binding so closures keep the narrowed type.
  const expiration = item.expirationDate;

  const now = Date.now();
  const targets: Target[] = [];

  // Is the expiration still in the future (or today)? Only then is a
  // "missed" reminder worth a catch-up send — once the item has actually
  // expired the dashboard's RED/expired state takes over and a late
  // "expires soon" email would be wrong/noise.
  const expDay = Date.UTC(
    expiration.getUTCFullYear(),
    expiration.getUTCMonth(),
    expiration.getUTCDate(),
  );
  const today = new Date();
  const todayDay = Date.UTC(
    today.getUTCFullYear(),
    today.getUTCMonth(),
    today.getUTCDate(),
  );
  const stillRelevant = expDay >= todayDay;

  // Build one target per offset. If its computed send-time is in the past
  // but the item hasn't expired yet, CLAMP to "now" (catch-up) instead of
  // dropping it — so a late-added or soon-expiring item still warns, and
  // it's sendable on the next cron tick / "Run due reminders now". A
  // genuinely stale reminder (item already expired) is skipped.
  const consider = (kind: "expiry" | "fee", offset: number) => {
    const when = atSendTime(expiration, offset);
    if (when.getTime() > now) {
      targets.push({ kind, offsetDays: offset, scheduledFor: when });
    } else if (stillRelevant) {
      targets.push({ kind, offsetDays: offset, scheduledFor: new Date() });
    }
  };

  for (const offset of item.reminderDaysBefore ?? []) {
    consider("expiry", offset);
  }
  if (item.feeDueDate) consider("fee", FEE_OFFSET_DAYS);

  if (targets.length === 0) return 0;

  // Channels: email always; SMS additionally on Pro+ (brief), and only if
  // the account has a phone number set.
  const [acct] = await tx
    .select({ planTier: account.planTier, smsPhone: account.smsPhone })
    .from(account)
    .where(eq(account.id, item.accountId))
    .limit(1);
  const channels: ("email" | "sms")[] = ["email"];
  if (acct && PLANS[acct.planTier].sms && acct.smsPhone) {
    channels.push("sms");
  }
  // Voice escalation: only at the 7-day mark, only on Pro+ (brief). At SEND
  // time the dispatcher additionally skips it if a prior reminder for the
  // item was already acknowledged.
  const voiceEligible =
    !!acct && PLANS[acct.planTier].voiceEscalation && !!acct.smsPhone;

  // Skip targets already represented by a sent/failed/skipped row.
  // Key includes channel so email & sms for the same kind+offset coexist.
  const existing = await tx
    .select({
      channel: reminderDispatch.channel,
      kind: reminderDispatch.kind,
      offsetDays: reminderDispatch.offsetDays,
    })
    .from(reminderDispatch)
    .where(
      and(
        eq(reminderDispatch.complianceItemId, item.id),
        inArray(reminderDispatch.status, ["sent", "failed", "skipped"]),
      ),
    );
  const taken = new Set(
    existing.map((e) => `${e.channel}:${e.kind}:${e.offsetDays}`),
  );

  const rows: (typeof reminderDispatch.$inferInsert)[] = channels.flatMap(
    (channel) =>
    targets
      .filter((t) => !taken.has(`${channel}:${t.kind}:${t.offsetDays}`))
      .map((t) => ({
        accountId: item.accountId,
        complianceItemId: item.id,
        channel,
        kind: t.kind,
        offsetDays: t.offsetDays,
        scheduledFor: t.scheduledFor,
        status: "scheduled" as const,
      })),
  );

  // One voice escalation at the 7-day expiry mark (Pro+).
  if (voiceEligible) {
    for (const t of targets) {
      if (
        t.kind === "expiry" &&
        t.offsetDays === 7 &&
        !taken.has(`voice:expiry:7`)
      ) {
        rows.push({
          accountId: item.accountId,
          complianceItemId: item.id,
          channel: "voice",
          kind: t.kind,
          offsetDays: t.offsetDays,
          scheduledFor: t.scheduledFor,
          status: "scheduled" as const,
        });
      }
    }
  }

  if (rows.length > 0) await tx.insert(reminderDispatch).values(rows);
  return rows.length;
}
