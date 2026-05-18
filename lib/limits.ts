import "server-only";
import { and, count, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { getDb } from "@/lib/db";
import { account, complianceItem, truck } from "@/lib/db/schema";
import type { PlanStatus, PlanTier } from "@/lib/db/schema";
import { PLANS } from "@/lib/stripe";

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
