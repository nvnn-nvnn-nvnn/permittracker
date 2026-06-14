import "server-only";
import * as Sentry from "@sentry/nextjs";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  account,
  accountDeletionLog,
  appUser,
  fileAttachment,
} from "@/lib/db/schema";
import { getStripe, isStripeConfigured } from "@/lib/stripe/client";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { deleteObjects } from "@/lib/storage";

/**
 * Hard-delete an account and its single owner (GDPR/CCPA erasure).
 *
 * Assumes the 1-user-per-account model. Ordering is deliberate: every
 * external/irreversible-read step runs BEFORE the account row is deleted,
 * because that row is our retry sentinel (the opening `if (!row) return`).
 * Only the final Postgres ops are wrapped in a transaction — we can't transact
 * across Stripe + Storage + Supabase Auth, so those are made idempotent
 * instead ("already gone" is swallowed; real failures abort before the cascade).
 *
 * Steps: read → cancel Stripe → delete storage bytes → delete auth identity →
 * tx{ purge audit, delete app_user, delete account (cascades all tenant data) }.
 */
export async function deleteAccount(
  accountId: string,
  opts: { deletedByUserId: string; reason?: string },
): Promise<void> {
  const db = getDb();

  // 1. Read everything we need while it still exists.
  const [row] = await db
    .select({
      ownerUserId: account.ownerUserId,
      stripeSubscriptionId: account.stripeSubscriptionId,
      name: account.name,
      slug: account.slug,
    })
    .from(account)
    .where(eq(account.id, accountId));

  if (!row) return; // already deleted — idempotent no-op

  const fileRows = await db
    .select({ path: fileAttachment.storagePath })
    .from(fileAttachment)
    .where(eq(fileAttachment.accountId, accountId));
  const paths = fileRows.map((r) => r.path);

  // 2. Cancel the Stripe subscription. Keep the customer + invoices (tax
  //    retention — an allowed GDPR/CCPA exception).
  if (row.stripeSubscriptionId && isStripeConfigured()) {
    try {
      await getStripe().subscriptions.cancel(row.stripeSubscriptionId);
    } catch (err) {
      // resource_missing = already canceled (a prior run / portal) → benign.
      if ((err as { code?: string }).code !== "resource_missing") {
        Sentry.captureException(err, {
          tags: { type: "account_deletion", step: "stripe_cancel" },
          extra: { accountId },
        });
        throw err;
      }
    }
  }

  // 3. Delete the stored document bytes. Must happen before the cascade wipes
  //    file_attachment — those rows are the only record of these paths.
  if (paths.length > 0) {
    await deleteObjects(paths);
  }

  // 4. Delete the Supabase auth identity (the actual login). Before the tx so
  //    the account row survives as the retry sentinel if this fails.
  if (row.ownerUserId) {
    const { error } = await getSupabaseAdmin().auth.admin.deleteUser(
      row.ownerUserId,
    );
    // 404 = user already gone (a prior run) → benign; anything else aborts.
    if (error && error.status !== 404) {
      Sentry.captureException(error, {
        tags: { type: "account_deletion", step: "auth_delete" },
        extra: { accountId },
      });
      throw error;
    }
  }

  // 5. Atomic Postgres teardown. purge_account_audit defeats the append-only
  //    guard for THIS account only; deleting the account cascades every tenant
  //    table; app_user is global so we remove it explicitly.
  await db.transaction(async (tx) => {
    await tx.execute(sql`select purge_account_audit(${accountId})`);
    // Proof-of-erasure ledger row — written atomically with the deletion. No
    // FK, so it outlives the cascade that removes the account + owner.
    await tx.insert(accountDeletionLog).values({
      accountId,
      accountName: row.name,
      accountSlug: row.slug,
      deletedByUserId: opts.deletedByUserId,
      reason: opts.reason ?? null,
    });
    await tx.delete(account).where(eq(account.id, accountId));
    if (row.ownerUserId) {
      await tx.delete(appUser).where(eq(appUser.id, row.ownerUserId));
    }
  });
}
