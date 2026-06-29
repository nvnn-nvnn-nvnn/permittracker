import { z } from "zod";
import { and, asc, desc, eq, gte, isNull, lt, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, opsProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import {
  inventoryCount,
  purchaseOrder,
  purchaseOrderItem,
  salesItemDay,
  squareConnection,
  truck,
} from "@/lib/db/schema";
import {
  isSquareConfigured,
  squareAdapterForToken,
} from "@/lib/square";
import {
  assignTruckLocation,
  clearTruckLocation,
  disconnectSquare,
  getSquareSummary,
  syncSquareSales,
} from "@/lib/square/sync";
import {
  deleteSquareOauth,
  getFreshSquareToken,
  getSquareOauthStatus,
  isSquareOAuthConfigured,
} from "@/lib/square/oauth";
import { serverEnv } from "@/lib/env";
import { periodPnl } from "@/lib/ops/pnl";
import { menuAnalysis } from "@/lib/ops/menu";
import { buildFinancialCsv } from "@/lib/ops/export";
import { applyUsageDepletion } from "@/lib/ops/depletion";
import { isQuickBooksConfigured } from "@/lib/quickbooks";

/**
 * Operations pillar router (Slice 1). All queries/mutations are account-scoped
 * from the session — never from client input.
 */
export const opsRouter = createTRPCRouter({
  /** Account Square summary: per-truck connections + OAuth status. */
  connection: opsProcedure.query(async ({ ctx }) => {
    const [summary, oauth] = await Promise.all([
      getSquareSummary(ctx.account.accountId),
      getSquareOauthStatus(ctx.account.accountId),
    ]);
    return {
      ...summary,
      // "configured" = a way to pull real data exists (OAuth app or static token)
      isSquareConfigured: isSquareConfigured() || isSquareOAuthConfigured(),
      oauthConfigured: isSquareOAuthConfigured(),
      oauthConnected: oauth.connected,
      merchantId: oauth.merchantId,
    };
  }),

  /** Live Square locations on the connected merchant (for the picker). */
  squareLocations: opsProcedure.query(async ({ ctx }) => {
    const live = await getFreshSquareToken(ctx.account.accountId);
    const env = serverEnv();
    const token = live?.accessToken ?? env.SQUARE_ACCESS_TOKEN;
    if (!token) return [];
    const adapter = squareAdapterForToken(
      token,
      live?.environment ?? env.SQUARE_ENVIRONMENT,
    );
    try {
      return await adapter.listLocations();
    } catch {
      return [];
    }
  }),

  /** Current truck → Square location mapping (for the picker). */
  truckLocations: opsProcedure.query(async ({ ctx }) => {
    return getDb()
      .select({
        truckId: truck.id,
        truckName: truck.name,
        locationId: squareConnection.locationId,
        locationName: squareConnection.locationName,
      })
      .from(truck)
      .leftJoin(squareConnection, eq(squareConnection.truckId, truck.id))
      .where(
        and(
          eq(truck.accountId, ctx.account.accountId),
          isNull(truck.archivedAt),
        ),
      )
      .orderBy(asc(truck.name));
  }),

  /** Assign a Square location to a truck (the location→truck picker). */
  assignLocation: opsProcedure
    .input(
      z.object({
        truckId: z.string().uuid(),
        locationId: z.string().min(1),
        locationName: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const [owned] = await getDb()
        .select({ id: truck.id })
        .from(truck)
        .where(
          and(
            eq(truck.id, input.truckId),
            eq(truck.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });

      // One truck per location: reject if another truck already holds it.
      const [taken] = await getDb()
        .select({ truckId: squareConnection.truckId })
        .from(squareConnection)
        .where(
          and(
            eq(squareConnection.accountId, ctx.account.accountId),
            eq(squareConnection.locationId, input.locationId),
          ),
        )
        .limit(1);
      if (taken && taken.truckId !== input.truckId) {
        throw new TRPCError({
          code: "CONFLICT",
          message:
            "That Square location is already assigned to another truck. Set that truck to “None” first.",
        });
      }

      const { merchantId } = await getSquareOauthStatus(ctx.account.accountId);
      await assignTruckLocation(
        ctx.account.accountId,
        input.truckId,
        input.locationId,
        input.locationName,
        merchantId,
      );
      return { ok: true };
    }),

  /** Unmap a truck from its Square location (the picker's "None"). */
  unassignLocation: opsProcedure
    .input(z.object({ truckId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [owned] = await getDb()
        .select({ id: truck.id })
        .from(truck)
        .where(
          and(
            eq(truck.id, input.truckId),
            eq(truck.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
      await clearTruckLocation(ctx.account.accountId, input.truckId);
      return { ok: true };
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

  /** Disconnect Square: drop OAuth tokens + mark connections disconnected
   *  (keeps already-synced sales history). */
  disconnect: opsProcedure.mutation(async ({ ctx }) => {
    await disconnectSquare(ctx.account.accountId);
    await deleteSquareOauth(ctx.account.accountId);
    return { ok: true };
  }),

  /** P&L by period (day/week/month), newest first. `truckId` scopes to one
   *  truck; omitted = account-wide rollup. */
  pnl: opsProcedure
    .input(
      z.object({
        granularity: z.enum(["day", "week", "month"]).default("week"),
        periods: z.number().int().min(1).max(60).optional(),
        truckId: z.string().uuid().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      return periodPnl(
        ctx.account.accountId,
        input.granularity,
        input.periods,
        input.truckId,
      );
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
  actualCogs: opsProcedure
    .input(z.object({ truckId: z.string().uuid().optional() }).optional())
    .query(async ({ ctx, input }) => {
      const truckId = input?.truckId;
      // Actual COGS is only meaningful per truck (counts are per-truck).
      if (!truckId) return { available: false as const, reason: "select_truck" as const };

      const counts = await getDb()
        .select({
          countedOn: inventoryCount.countedOn,
          totalValueCents: inventoryCount.totalValueCents,
        })
        .from(inventoryCount)
        .where(
          and(
            eq(inventoryCount.accountId, ctx.account.accountId),
            eq(inventoryCount.truckId, truckId),
          ),
        )
        .orderBy(desc(inventoryCount.countedOn), desc(inventoryCount.createdAt))
        .limit(2);

      const [closing, opening] = counts;
      if (!closing || !opening)
        return { available: false as const, reason: "need_counts" as const };

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
            eq(purchaseOrder.truckId, truckId),
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

  /**
   * Recompute inventory usage/depletion from existing sales × recipes for the
   * last 90 days — without re-pulling Square. Idempotent (delta reconcile);
   * useful after adding/editing recipes so usage reflects them immediately.
   */
  recomputeUsage: opsProcedure.mutation(async ({ ctx }) => {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - 90);
    return applyUsageDepletion(ctx.account.accountId, start, end);
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
