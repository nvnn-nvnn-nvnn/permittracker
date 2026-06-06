import "server-only";
import { and, asc, desc, eq, isNotNull, isNull, lte } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  account,
  appUser,
  complianceItem,
  reminderDispatch,
} from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { getEmailAdapter } from "@/lib/email";
import { getSmsAdapter } from "@/lib/sms";
import { getVoiceAdapter, buildEscalationTwiml } from "@/lib/voice";
import { createAcknowledgeToken } from "./token";
import { buildReminderEmail } from "./email";
import { fmtDate } from "@/lib/format";
import * as Sentry from '@sentry/nextjs';

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
      smsPhone: account.smsPhone,
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
  const sms = getSmsAdapter();
  const voice = getVoiceAdapter();

  const markSkipped = async (id: string, reason: string) => {
    await db
      .update(reminderDispatch)
      .set({ status: "skipped", sentAt: now, error: reason })
      .where(eq(reminderDispatch.id, id));
    summary.skipped++;
  };

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
    const ackUrl = `${appUrl}/api/reminders/acknowledge?token=${createAcknowledgeToken(
      d.id,
    )}`;
    const label =
      row.item.subtype ||
      row.item.identifier ||
      row.item.itemType.toUpperCase();

    try {
      if (d.channel === "voice") {
        if (!row.smsPhone) {
          await markSkipped(d.id, "No phone for voice escalation");
          continue;
        }
        // Brief: voice only if NO prior reminder was acknowledged.
        const [prior] = await db
          .select({ id: reminderDispatch.id })
          .from(reminderDispatch)
          .where(
            and(
              eq(reminderDispatch.complianceItemId, d.complianceItemId),
              isNotNull(reminderDispatch.acknowledgedAt),
            ),
          )
          .limit(1);
        if (prior) {
          await markSkipped(d.id, "Prior reminder already acknowledged");
          continue;
        }
        const twiml = buildEscalationTwiml({
          spoken: `This is PermitKeep. ${label} ${
            d.kind === "fee" ? "has a fee due" : "expires"
          } ${fmtDate(row.item.expirationDate)}.`,
          actionUrl: `${appUrl}/api/webhooks/twilio-voice?token=${createAcknowledgeToken(
            d.id,
          )}`,
        });
        await voice.call({ to: row.smsPhone, twiml });
      } else if (d.channel === "sms") {
        if (!row.smsPhone) {
          await markSkipped(d.id, "No SMS phone on account");
          continue;
        }
        const body =
          `PermitKeep: ${label} ${
            d.kind === "fee" ? "fee due" : "expires"
          } ${fmtDate(row.item.expirationDate)}. ` +
          `Reply OK to acknowledge, or: ${ackUrl}`;
        await sms.send({ to: row.smsPhone, body });
      } else {
        if (!row.ownerEmail) {
          await db
            .update(reminderDispatch)
            .set({ status: "failed", sentAt: now, error: "No owner email" })
            .where(eq(reminderDispatch.id, d.id));
          summary.failed++;
          continue;
        }
        const { subject, html, text } = buildReminderEmail({
          item: row.item,
          dispatch: d,
          acknowledgeUrl: ackUrl,
          itemUrl: `${appUrl}/items/${row.item.id}`,
        });
        await email.send({ to: row.ownerEmail, subject, html, text });
      }
      await db
        .update(reminderDispatch)
        .set({ status: "sent", sentAt: new Date(), error: null })
        .where(eq(reminderDispatch.id, d.id));
      summary.sent++;
    } catch (err) {
      Sentry.captureException(err, {
        tags: { type: "dispatch_failure", channel: d.channel},
        extra: {dispatchId: d.id, accountId: d.accountId},
      });

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

/**
 * Inbound SMS "OK" → acknowledge. Resolves the account by the sender's
 * phone, then acknowledges that account's most recent sent, unacked SMS
 * reminder. Only the user texting "OK" triggers this — never automatic.
 */
export async function acknowledgeBySmsReply(
  fromPhone: string,
  body: string,
): Promise<{ ok: boolean; acknowledgedId?: string }> {
  if (body.trim().toUpperCase() !== "OK") return { ok: false };
  const db = getDb();
  const [acct] = await db
    .select({ id: account.id })
    .from(account)
    .where(eq(account.smsPhone, fromPhone))
    .limit(1);
  if (!acct) return { ok: false };

  const [d] = await db
    .select({ id: reminderDispatch.id })
    .from(reminderDispatch)
    .where(
      and(
        eq(reminderDispatch.accountId, acct.id),
        eq(reminderDispatch.channel, "sms"),
        eq(reminderDispatch.status, "sent"),
        isNull(reminderDispatch.acknowledgedAt),
      ),
    )
    .orderBy(desc(reminderDispatch.sentAt))
    .limit(1);
  if (!d) return { ok: false };

  await acknowledgeDispatch(d.id);
  return { ok: true, acknowledgedId: d.id };
}
