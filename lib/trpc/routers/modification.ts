import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import { truck, truckModification } from "@/lib/db/schema";
import { truckModificationInput } from "@/lib/validators";

async function assertTruckOwned(accountId: string, truckId: string) {
  const [owned] = await getDb()
    .select({ id: truck.id })
    .from(truck)
    .where(and(eq(truck.id, truckId), eq(truck.accountId, accountId)))
    .limit(1);
  if (!owned) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Truck not found in this account.",
    });
  }
}

async function assertOwned(accountId: string, id: string) {
  const [owned] = await getDb()
    .select({ id: truckModification.id })
    .from(truckModification)
    .where(
      and(
        eq(truckModification.id, id),
        eq(truckModification.accountId, accountId),
      ),
    )
    .limit(1);
  if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
}

/** Truck modification / health-dept change log. Account-scoped, archive-only. */
export const modificationRouter = createTRPCRouter({
  list: protectedProcedure
    .input(
      z
        .object({
          truckId: z.string().uuid().optional(),
          includeArchived: z.boolean().default(false),
        })
        .optional(),
    )
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select({
          mod: truckModification,
          truckName: truck.name,
        })
        .from(truckModification)
        .innerJoin(truck, eq(truck.id, truckModification.truckId))
        .where(eq(truckModification.accountId, ctx.account.accountId))
        .orderBy(desc(truckModification.changedOn));
      return rows
        .filter((r) => (input?.truckId ? r.mod.truckId === input.truckId : true))
        .filter((r) => (input?.includeArchived ? true : r.mod.archivedAt === null))
        .map((r) => ({ ...r.mod, truckName: r.truckName }));
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select()
        .from(truckModification)
        .where(
          and(
            eq(truckModification.id, input.id),
            eq(truckModification.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(truckModificationInput)
    .mutation(async ({ ctx, input }) => {
      await assertTruckOwned(ctx.account.accountId, input.truckId);
      const [row] = await getDb()
        .insert(truckModification)
        .values({
          accountId: ctx.account.accountId,
          truckId: input.truckId,
          description: input.description,
          category: input.category,
          changedOn: input.changedOn,
          reinspectionStatus: input.reinspectionStatus ?? "not_required",
          reportedToHealthDept: input.reportedToHealthDept ?? false,
          notes: input.notes,
          createdByUserId: ctx.account.userId,
        })
        .returning();
      return row;
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: truckModificationInput }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      await assertTruckOwned(ctx.account.accountId, input.data.truckId);
      const [row] = await getDb()
        .update(truckModification)
        .set({
          truckId: input.data.truckId,
          description: input.data.description,
          category: input.data.category,
          changedOn: input.data.changedOn,
          reinspectionStatus: input.data.reinspectionStatus ?? "not_required",
          reportedToHealthDept: input.data.reportedToHealthDept ?? false,
          notes: input.data.notes,
          updatedAt: new Date(),
        })
        .where(eq(truckModification.id, input.id))
        .returning();
      return row;
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      const [row] = await getDb()
        .update(truckModification)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(truckModification.id, input.id))
        .returning();
      return row;
    }),
});
