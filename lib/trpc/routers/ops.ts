import { z } from "zod";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, opsProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import {
  inventoryCount,
  purchaseOrder,
  purchaseOrderItem,
  salesItemDay,
} from "@/lib/db/schema";
import { isSquareConfigured } from "@/lib/square";
import {
  disconnectSquare,
  getSquareConnection,
  syncSquareSales,
} from "@/lib/square/sync";
import { weeklyPnl } from "@/lib/ops/pnl";
import { menuAnalysis } from "@/lib/ops/menu";
import { buildFinancialCsv } from "@/lib/ops/export";
import { isQuickBooksConfigured } from "@/lib/quickbooks";

/**
 * Operations pillar router (Slice 1). All queries/mutations are account-scoped
 * from the session — never from client input.
 */
export const opsRouter = createTRPCRouter({
  /** Current Square connection + whether real creds (vs. demo stub) are set. */
  connection: opsProcedure.query(async ({ ctx }) => {
    const connection = await getSquareConnection(ctx.account.accountId);
    return { connection, isSquareConfigured: isSquareConfigured() };
  }),

  /** Connect (first sync) or refresh: pulls daily sales and upserts them. */
  sync: opsProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).optional() }))
    .mutation(async ({ ctx, input }) => {
      try {
        return await syncSquareSales(ctx.account.accountId, {
          days: input.days,
          userId: ctx.account.userId,
        });
      } catch (err) {
        throw new TRPCError({
          code: "BAD_GATEWAY",
          message:
            err instanceof Error
              ? `Square sync failed: ${err.message}`
              : "Square sync failed",
        });
      }
    }),

  /** Disconnect Square (keeps already-synced history). */
  disconnect: opsProcedure.mutation(async ({ ctx }) => {
    await disconnectSquare(ctx.account.accountId);
    return { ok: true };
  }),

  /** Weekly P&L, newest week first. */
  weeklyPnl: opsProcedure
    .input(z.object({ weeks: z.number().int().min(1).max(26).default(8) }))
    .query(async ({ ctx, input }) => {
      return weeklyPnl(ctx.account.accountId, input.weeks);
    }),

  /** Item-level sales over the last `days`, best-sellers first. */
  itemSales: opsProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - input.days);
      const rows = await getDb()
        .select({
          itemName: salesItemDay.itemName,
          qtySold: sql<number>`sum(${salesItemDay.qtySold})`,
          grossSalesCents: sql<number>`sum(${salesItemDay.grossSalesCents})::int`,
        })
        .from(salesItemDay)
        .where(
          and(
            eq(salesItemDay.accountId, ctx.account.accountId),
            gte(salesItemDay.businessDate, since),
          ),
        )
        .groupBy(salesItemDay.itemName)
        .orderBy(desc(sql`sum(${salesItemDay.grossSalesCents})`));
      return rows.map((r) => ({
        itemName: r.itemName,
        qtySold: Number(r.qtySold),
        grossSalesCents: Number(r.grossSalesCents),
      }));
    }),

  /** Menu engineering — item sales matched to recipe cost, classified. */
  menuAnalysis: opsProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      return menuAnalysis(ctx.account.accountId, input.days);
    }),

  /**
   * Actual food cost between the two most recent inventory counts:
   * opening value + purchases received − closing value. Captures real
   * consumption incl. waste/shrink (vs. the P&L's lumpy purchases proxy).
   */
  actualCogs: opsProcedure.query(async ({ ctx }) => {
    const counts = await getDb()
      .select({
        countedOn: inventoryCount.countedOn,
        totalValueCents: inventoryCount.totalValueCents,
      })
      .from(inventoryCount)
      .where(eq(inventoryCount.accountId, ctx.account.accountId))
      .orderBy(desc(inventoryCount.countedOn), desc(inventoryCount.createdAt))
      .limit(2);

    const [closing, opening] = counts;
    if (!closing || !opening) return { available: false as const };

    // Purchases received in (opening day .. closing day inclusive).
    const endExclusive = new Date(closing.countedOn);
    endExclusive.setUTCDate(endExclusive.getUTCDate() + 1);
    const [p] = await getDb()
      .select({
        total: sql<number>`coalesce(round(sum(${purchaseOrderItem.qty} * ${purchaseOrderItem.unitCostCents}))::int, 0)`,
      })
      .from(purchaseOrder)
      .leftJoin(
        purchaseOrderItem,
        eq(purchaseOrderItem.purchaseOrderId, purchaseOrder.id),
      )
      .where(
        and(
          eq(purchaseOrder.accountId, ctx.account.accountId),
          eq(purchaseOrder.status, "received"),
          gte(purchaseOrder.receivedAt, opening.countedOn),
          lt(purchaseOrder.receivedAt, endExclusive),
        ),
      );

    const purchasesCents = Number(p?.total ?? 0);
    const cogsCents =
      opening.totalValueCents + purchasesCents - closing.totalValueCents;
    return {
      available: true as const,
      openingValueCents: opening.totalValueCents,
      closingValueCents: closing.totalValueCents,
      purchasesCents,
      cogsCents,
      periodStart: opening.countedOn,
      periodEnd: closing.countedOn,
    };
  }),

  /** Whether live QuickBooks sync is configured (vs. CSV-export only). */
  quickbooksStatus: opsProcedure.query(async () => {
    return { liveSyncConfigured: isQuickBooksConfigured() };
  }),

  /** QuickBooks-importable transactions CSV (sales + expenses) for `days`. */
  financialExport: opsProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(90) }))
    .query(async ({ ctx, input }) => {
      return buildFinancialCsv(ctx.account.accountId, input.days);
    }),
});
