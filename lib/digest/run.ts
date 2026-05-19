import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { account, appUser } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { getEmailAdapter } from "@/lib/email";
import { MN_JURISDICTIONS } from "@/lib/jurisdictions";
import { ensureDigest } from "./generate";
import { digestsForAccount } from "./resolve";
import { buildDigestEmail } from "./email";
import { currentPeriod } from "./period";

export interface DigestRunSummary {
  period: string;
  generated: number;
  skipped: number;
  emailed: number;
}

/**
 * Generate the period's digests for every seeded jurisdiction, then email
 * each account the digests for its own jurisdictions. Shared by the monthly
 * Inngest cron and the admin "generate & send now" action — identical path.
 */
export async function runMonthlyDigests(
  periodArg?: string,
): Promise<DigestRunSummary> {
  const period = periodArg ?? currentPeriod();
  let generated = 0;
  let skipped = 0;

  for (const j of MN_JURISDICTIONS) {
    const r = await ensureDigest(j, period);
    if (r.created) generated++;
    else if (r.skipped) skipped++;
  }

  const db = getDb();
  const accounts = await db
    .select({
      id: account.id,
      ownerEmail: appUser.email,
    })
    .from(account)
    .leftJoin(appUser, eq(appUser.id, account.ownerUserId));

  const appUrl = serverEnv().APP_URL;
  const email = getEmailAdapter();
  let emailed = 0;

  for (const a of accounts) {
    if (!a.ownerEmail) continue;
    const digests = await digestsForAccount(a.id, period);
    if (digests.length === 0) continue;
    const { subject, html, text } = buildDigestEmail({
      period,
      digests,
      appUrl,
    });
    try {
      await email.send({ to: a.ownerEmail, subject, html, text });
      emailed++;
    } catch {
      // A single bad recipient shouldn't abort the whole run.
    }
  }

  return { period, generated, skipped, emailed };
}
