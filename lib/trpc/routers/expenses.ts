import { z } from "zod";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, opsProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import { expense } from "@/lib/db/schema";
import { expenseInput } from "@/lib/validators";

function toCents(dollars: number): number {
  return Math.round(dollars * 100);
}

export const expensesRouter = createTRPCRouter({
  list: opsProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select()
        .from(expense)
        .where(eq(expense.accountId, ctx.account.accountId))
        .orderBy(desc(expense.spentOn));
      return input?.includeArchived
        ? rows
        : rows.filter((r) => r.archivedAt === null);
    }),

  byId: opsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select()
        .from(expense)
        .where(
          and(
            eq(expense.id, input.id),
            eq(expense.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  /** Total spend (cents) over the last `days`, for the Operations snapshot. */
  summary: opsProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - input.days);
      const [row] = await getDb()
        .select({
          count: sql<number>`count(*)::int`,
          totalCents: sql<number>`coalesce(sum(${expense.amountCents})::bigint, 0)`,
        })
        .from(expense)
        .where(
          and(
            eq(expense.accountId, ctx.account.accountId),
            isNull(expense.archivedAt),
            gte(expense.spentOn, since),
          ),
        );
      return {
        days: input.days,
        count: Number(row?.count ?? 0),
        totalCents: Number(row?.totalCents ?? 0),
      };
    }),

  create: opsProcedure
    .input(expenseInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await getDb()
        .insert(expense)
        .values({
          accountId: ctx.account.accountId,
          truckId: input.truckId ?? null,
          description: input.description,
          category: input.category,
          amountCents: toCents(input.amount),
          spentOn: input.spentOn,
          vendorName: input.vendorName,
          notes: input.notes,
          createdByUserId: ctx.account.userId,
        })
        .returning();
      return row;
    }),

  update: opsProcedure
    .input(z.object({ id: z.string().uuid(), data: expenseInput }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      const [row] = await getDb()
        .update(expense)
        .set({
          truckId: input.data.truckId ?? null,
          description: input.data.description,
          category: input.data.category,
          amountCents: toCents(input.data.amount),
          spentOn: input.data.spentOn,
          vendorName: input.data.vendorName,
          notes: input.data.notes,
          updatedAt: new Date(),
        })
        .where(eq(expense.id, input.id))
        .returning();
      return row;
    }),

  archive: opsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      const [row] = await getDb()
        .update(expense)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(expense.id, input.id))
        .returning();
      return row;
    }),
});

async function assertOwned(accountId: string, id: string): Promise<void> {
  const [owned] = await getDb()
    .select({ id: expense.id })
    .from(expense)
    .where(and(eq(expense.id, id), eq(expense.accountId, accountId)))
    .limit(1);
  if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
}
