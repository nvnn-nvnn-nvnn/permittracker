import "server-only";
import { and, eq, inArray } from "drizzle-orm";
import type { DbTx } from "@/lib/db";
import { reminderDispatch } from "@/lib/db/schema";
import type { ComplianceItem } from "@/lib/db/schema";

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

  const now = Date.now();
  const targets: Target[] = [];

  for (const offset of item.reminderDaysBefore ?? []) {
    const when = atSendTime(item.expirationDate, offset);
    if (when.getTime() > now) {
      targets.push({ kind: "expiry", offsetDays: offset, scheduledFor: when });
    }
  }
  if (item.feeDueDate) {
    const when = atSendTime(item.expirationDate, FEE_OFFSET_DAYS);
    if (when.getTime() > now) {
      targets.push({
        kind: "fee",
        offsetDays: FEE_OFFSET_DAYS,
        scheduledFor: when,
      });
    }
  }
  if (targets.length === 0) return 0;

  // Skip targets already represented by a sent/failed/skipped row.
  const existing = await tx
    .select({
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
  const taken = new Set(existing.map((e) => `${e.kind}:${e.offsetDays}`));

  const rows = targets
    .filter((t) => !taken.has(`${t.kind}:${t.offsetDays}`))
    .map((t) => ({
      accountId: item.accountId,
      complianceItemId: item.id,
      channel: "email" as const,
      kind: t.kind,
      offsetDays: t.offsetDays,
      scheduledFor: t.scheduledFor,
      status: "scheduled" as const,
    }));

  if (rows.length > 0) await tx.insert(reminderDispatch).values(rows);
  return rows.length;
}
