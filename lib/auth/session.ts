import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { account, appUser, membership } from "@/lib/db/schema";
import type { MembershipRole, PlanTier } from "@/lib/db/schema";
import { createSupabaseServerClient } from "./server";

export interface AccountContext {
  userId: string;
  email: string;
  fullName: string | null;
  isPlatformAdmin: boolean;
  accountId: string;
  accountName: string;
  accountSlug: string;
  planTier: PlanTier;
  role: MembershipRole;
}

/** Authenticated Supabase user, or null. Memoized per request. */
export const getAuthUser = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user;
});

function slugify(input: string): string {
  return (
    input
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "account"
  );
}

/**
 * Resolves the active account context for the signed-in user, provisioning an
 * Account + app_user + owner Membership on first sign-in.
 *
 * Server-side provisioning (not a client mutation). account_id is ALWAYS
 * derived here from the authenticated session — never trusted from a request.
 * Memoized per request via React `cache`.
 */
export const getAccountContext = cache(
  async (): Promise<AccountContext | null> => {
    const user = await getAuthUser();
    if (!user) return null;

    const db = getDb();
    const email = user.email ?? "";
    const fullName =
      (user.user_metadata?.full_name as string | undefined) ?? null;

    // Ensure the app_user identity row exists / is current.
    await db
      .insert(appUser)
      .values({ id: user.id, email, fullName })
      .onConflictDoUpdate({
        target: appUser.id,
        set: { email, updatedAt: new Date() },
      });

    // Find an existing membership (the user's active account).
    const existing = await db
      .select({
        accountId: membership.accountId,
        role: membership.role,
        accountName: account.name,
        accountSlug: account.slug,
        planTier: account.planTier,
      })
      .from(membership)
      .innerJoin(account, eq(account.id, membership.accountId))
      .where(eq(membership.userId, user.id))
      .limit(1);

    let row = existing[0];

    if (!row) {
      // First sign-in: provision a personal account, owned by this user.
      const baseSlug = slugify(email.split("@")[0] ?? "account");
      const slug = `${baseSlug}-${user.id.slice(0, 6)}`;
      const accountName = email.split("@")[0] ?? "My Account";

      const [created] = await db
        .insert(account)
        .values({ name: accountName, slug, ownerUserId: user.id })
        .returning();
      if (!created) throw new Error("Failed to provision account");

      await db.insert(membership).values({
        accountId: created.id,
        userId: user.id,
        role: "owner",
      });

      row = {
        accountId: created.id,
        role: "owner",
        accountName: created.name,
        accountSlug: created.slug,
        planTier: created.planTier,
      };
    }

    const [userRow] = await db
      .select({ isPlatformAdmin: appUser.isPlatformAdmin })
      .from(appUser)
      .where(eq(appUser.id, user.id))
      .limit(1);

    return {
      userId: user.id,
      email,
      fullName,
      isPlatformAdmin: userRow?.isPlatformAdmin ?? false,
      accountId: row.accountId,
      accountName: row.accountName,
      accountSlug: row.accountSlug,
      planTier: row.planTier,
      role: row.role,
    };
  },
);

/** Use in protected Server Components/layouts. Redirects if unauthenticated. */
export async function requireAccountContext(): Promise<AccountContext> {
  const ctx = await getAccountContext();
  if (!ctx) redirect("/login");
  return ctx;
}

/** Membership check helper for an arbitrary account (defense in depth). */
export async function assertMembership(accountId: string): Promise<void> {
  const user = await getAuthUser();
  if (!user) redirect("/login");
  const db = getDb();
  const [m] = await db
    .select({ id: membership.id })
    .from(membership)
    .where(
      and(
        eq(membership.accountId, accountId),
        eq(membership.userId, user.id),
      ),
    )
    .limit(1);
  if (!m) throw new Error("Forbidden: not a member of this account");
}
