import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "@/lib/db";
import { account, complianceItem, truck } from "@/lib/db/schema";
import type { PlanStatus, PlanTier } from "@/lib/db/schema";
import { PLANS } from "@/lib/stripe";
import { isStripeConfigured } from "@/lib/stripe/client";

/**
 * The tier whose limits actually apply. A lapsed/never-subscribed account
 * falls back to the most restrictive (starter) tier — you don't keep Pro
 * limits after cancelling.
 */
export function effectiveTier(
  tier: PlanTier,
  status: PlanStatus,
): PlanTier {
  return status === "active" || status === "trialing" ? tier : "starter";
}

/** Whether the account's effective plan includes the Operations pillar. */
export function operationsEnabled(
  tier: PlanTier,
  status: PlanStatus,
): boolean {
  return PLANS[effectiveTier(tier, status)].operations;
}

/**
 * True if this account may use the Operations pillar. When Stripe isn't
 * configured (local/preview, pre-launch), it's open so the feature is testable
 * — billing-resilient, same posture as the rest of billing.
 */
export async function accountHasOperations(
  accountId: string,
): Promise<boolean> {
  if (!isStripeConfigured()) return true;
  const [acc] = await getDb()
    .select({ tier: account.planTier, status: account.planStatus })
    .from(account)
    .where(eq(account.id, accountId))
    .limit(1);
  if (!acc) return false;
  return operationsEnabled(acc.tier, acc.status);
}

/** Throw FORBIDDEN unless the account may use the Operations pillar. */
export async function assertOperationsAccess(
  accountId: string,
): Promise<void> {
  if (await accountHasOperations(accountId)) return;
  throw new TRPCError({
    code: "FORBIDDEN",
    message:
      "The Operations tools (sales, inventory, recipes, purchasing, P&L) are " +
      "on the Pro plan and up. Upgrade in Settings → Billing.",
  });
}

/**
 * Throw FORBIDDEN if creating another truck/item would exceed the account's
 * plan. Counts only non-archived rows (archiving frees capacity). Enforced
 * at the tRPC layer via `limitedProcedure` (see lib/trpc/trpc.ts).
 */
export async function assertWithinLimit(
  accountId: string,
  kind: "truck" | "item",
): Promise<void> {
  const db = getDb();
  const [acc] = await db
    .select({ tier: account.planTier, status: account.planStatus })
    .from(account)
    .where(eq(account.id, accountId))
    .limit(1);
  if (!acc) return;

  const plan = PLANS[effectiveTier(acc.tier, acc.status)];

  if (kind === "truck") {
    const [r] = await db
      .select({ n: count() })
      .from(truck)
      .where(
        and(eq(truck.accountId, accountId), isNull(truck.archivedAt)),
      );
    if (Number(r?.n ?? 0) >= plan.maxTrucks) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Your ${plan.label} plan allows ${plan.maxTrucks} active truck${
          plan.maxTrucks === 1 ? "" : "s"
        }. Upgrade in Settings → Billing to add more.`,
      });
    }
    return;
  }

  if (plan.maxItems !== null) {
    const [r] = await db
      .select({ n: count() })
      .from(complianceItem)
      .where(
        and(
          eq(complianceItem.accountId, accountId),
          isNull(complianceItem.archivedAt),
        ),
      );
    if (Number(r?.n ?? 0) >= plan.maxItems) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: `Your ${plan.label} plan allows ${plan.maxItems} compliance items. Upgrade in Settings → Billing for unlimited.`,
      });
    }
  }
}
