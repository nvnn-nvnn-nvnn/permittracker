import { desc, sql } from "drizzle-orm";
import { createTRPCRouter, adminProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import { extractionCost } from "@/lib/db/schema";

/**
 * Platform-admin only (adminProcedure enforces the is_platform_admin flag).
 * Phase 9 expands this; Phase 3 needs the extraction cost dashboard.
 *
 * NOTE: intentionally NOT account-scoped — this is the platform operator's
 * cross-tenant cost view, gated by the admin role, not tenant membership.
 */
export const adminRouter = createTRPCRouter({
  extractionCostSummary: adminProcedure.query(async () => {
    const db = getDb();
    const [totals] = await db
      .select({
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${extractionCost.inputTokens}),0)::int`,
        outputTokens: sql<number>`coalesce(sum(${extractionCost.outputTokens}),0)::int`,
        costMicroUsd: sql<number>`coalesce(sum(${extractionCost.costMicroUsd}),0)::bigint`,
      })
      .from(extractionCost);

    const recent = await db
      .select()
      .from(extractionCost)
      .orderBy(desc(extractionCost.createdAt))
      .limit(20);

    return {
      totals: totals ?? {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costMicroUsd: 0,
      },
      recent,
    };
  }),
});
