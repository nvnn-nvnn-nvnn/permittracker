import "server-only";
import { and, asc, eq, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  account,
  appUser,
  complianceItem,
  reminderDispatch,
} from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { getEmailAdapter } from "@/lib/email";
import { createAcknowledgeToken } from "./token";
import { buildReminderEmail } from "./email";

export interface DispatchSummary {
  processed: number;
  sent: number;
  failed: number;
  skipped: number;
}

/**
 * Send every due reminder (scheduled & scheduled_for <= now). Shared by the
 * Inngest 5-min cron and the manual "run now" tRPC. Optionally scoped to one
 * account (the manual trigger scopes to the caller's account).
 *
 * Recipient = the account owner's email. Reminder emails go through the email
 * adapter (Resend live, or no-op when unconfigured). We never acknowledge on
 * the user's behalf — the email carries a signed link only.
 */
export async function processDueDispatches(opts?: {
  accountId?: string;
  limit?: number;
}): Promise<DispatchSummary> {
  const db = getDb();
  const now = new Date();
  const limit = opts?.limit ?? 100;

  const where = [
    eq(reminderDispatch.status, "scheduled"),
    lte(reminderDispatch.scheduledFor, now),
  ];
  if (opts?.accountId) {
    where.push(eq(reminderDispatch.accountId, opts.accountId));
  }

  const due = await db
    .select({
      dispatch: reminderDispatch,
      item: complianceItem,
      ownerEmail: appUser.email,
    })
    .from(reminderDispatch)
    .innerJoin(
      complianceItem,
      eq(complianceItem.id, reminderDispatch.complianceItemId),
    )
    .innerJoin(account, eq(account.id, reminderDispatch.accountId))
    .leftJoin(appUser, eq(appUser.id, account.ownerUserId))
    .where(and(...where))
    .orderBy(asc(reminderDispatch.scheduledFor))
    .limit(limit);

  const summary: DispatchSummary = {
    processed: 0,
    sent: 0,
    failed: 0,
    skipped: 0,
  };
  const appUrl = serverEnv().APP_URL;
  const email = getEmailAdapter();

  for (const row of due) {
    summary.processed++;
    const d = row.dispatch;

    // Item archived (or vanished) since scheduling → skip, don't send.
    if (row.item.archivedAt) {
      await db
        .update(reminderDispatch)
        .set({ status: "skipped", sentAt: now })
        .where(eq(reminderDispatch.id, d.id));
      summary.skipped++;
      continue;
    }
    if (!row.ownerEmail) {
      await db
        .update(reminderDispatch)
        .set({
          status: "failed",
          sentAt: now,
          error: "No account owner email",
        })
        .where(eq(reminderDispatch.id, d.id));
      summary.failed++;
      continue;
    }

    const { subject, html, text } = buildReminderEmail({
      item: row.item,
      dispatch: d,
      acknowledgeUrl: `${appUrl}/api/reminders/acknowledge?token=${createAcknowledgeToken(
        d.id,
      )}`,
      itemUrl: `${appUrl}/items/${row.item.id}`,
    });

    try {
      await email.send({ to: row.ownerEmail, subject, html, text });
      await db
        .update(reminderDispatch)
        .set({ status: "sent", sentAt: new Date(), error: null })
        .where(eq(reminderDispatch.id, d.id));
      summary.sent++;
    } catch (err) {
      await db
        .update(reminderDispatch)
        .set({
          status: "failed",
          sentAt: new Date(),
          error: err instanceof Error ? err.message : "send failed",
        })
        .where(eq(reminderDispatch.id, d.id));
      summary.failed++;
    }
  }

  return summary;
}

/** Mark a dispatch acknowledged. Idempotent. Only via the signed link. */
export async function acknowledgeDispatch(dispatchId: string): Promise<
  | { ok: true; alreadyAcked: boolean }
  | { ok: false; reason: "not_found" }
> {
  const db = getDb();
  const [d] = await db
    .select()
    .from(reminderDispatch)
    .where(eq(reminderDispatch.id, dispatchId))
    .limit(1);
  if (!d) return { ok: false, reason: "not_found" };
  if (d.acknowledgedAt) return { ok: true, alreadyAcked: true };

  await db
    .update(reminderDispatch)
    .set({ acknowledgedAt: new Date() })
    .where(eq(reminderDispatch.id, dispatchId));
  // Touch updatedAt on the item so dashboards recompute promptly.
  await db
    .update(complianceItem)
    .set({ updatedAt: new Date() })
    .where(eq(complianceItem.id, d.complianceItemId));
  return { ok: true, alreadyAcked: false };
}
