import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb, withActor } from "@/lib/db";
import { truck } from "@/lib/db/schema";
import { truckInput } from "@/lib/validators";

/** Every query/mutation is scoped to ctx.account.accountId (from session). */
export const truckRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(truck)
        .where(eq(truck.accountId, ctx.account.accountId))
        .orderBy(desc(truck.createdAt));
      return input?.includeArchived
        ? rows
        : rows.filter((r) => r.archivedAt === null);
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [row] = await db
        .select()
        .from(truck)
        .where(
          and(
            eq(truck.id, input.id),
            eq(truck.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(truckInput)
    .mutation(async ({ ctx, input }) => {
      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .insert(truck)
          .values({
            accountId: ctx.account.accountId,
            name: input.name,
            plateOrVin: input.plateOrVin,
            jurisdiction: input.jurisdiction,
            isActive: input.isActive ?? true,
            notes: input.notes,
            createdByUserId: ctx.account.userId,
          })
          .returning();
        return row;
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: truckInput }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      // Ownership check BEFORE mutating — never trust the id alone.
      const [owned] = await db
        .select({ id: truck.id })
        .from(truck)
        .where(
          and(
            eq(truck.id, input.id),
            eq(truck.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });

      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(truck)
          .set({
            name: input.data.name,
            plateOrVin: input.data.plateOrVin,
            jurisdiction: input.data.jurisdiction,
            isActive: input.data.isActive ?? true,
            notes: input.data.notes,
            updatedAt: new Date(),
          })
          .where(eq(truck.id, input.id))
          .returning();
        return row;
      });
    }),

  /** Soft delete only — sets archived_at. Trigger logs action='archive'. */
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [owned] = await db
        .select({ id: truck.id })
        .from(truck)
        .where(
          and(
            eq(truck.id, input.id),
            eq(truck.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });

      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(truck)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(truck.id, input.id))
          .returning();
        return row;
      });
    }),
});
