import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb, withActor } from "@/lib/db";
import { commissary } from "@/lib/db/schema";
import { commissaryInput } from "@/lib/validators";

/** Account-scoped, archive-only, audited — same shape as truck/item. */
export const commissaryRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select()
        .from(commissary)
        .where(eq(commissary.accountId, ctx.account.accountId))
        .orderBy(desc(commissary.createdAt));
      return input?.includeArchived
        ? rows
        : rows.filter((r) => r.archivedAt === null);
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select()
        .from(commissary)
        .where(
          and(
            eq(commissary.id, input.id),
            eq(commissary.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(commissaryInput)
    .mutation(async ({ ctx, input }) => {
      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .insert(commissary)
          .values({
            accountId: ctx.account.accountId,
            name: input.name,
            address: input.address,
            permitExpiration: input.permitExpiration ?? null,
            contractExpiration: input.contractExpiration ?? null,
            notes: input.notes,
            createdByUserId: ctx.account.userId,
          })
          .returning();
        return row;
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: commissaryInput }))
    .mutation(async ({ ctx, input }) => {
      const [owned] = await getDb()
        .select({ id: commissary.id })
        .from(commissary)
        .where(
          and(
            eq(commissary.id, input.id),
            eq(commissary.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });

      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(commissary)
          .set({
            name: input.data.name,
            address: input.data.address,
            permitExpiration: input.data.permitExpiration ?? null,
            contractExpiration: input.data.contractExpiration ?? null,
            notes: input.data.notes,
            updatedAt: new Date(),
          })
          .where(eq(commissary.id, input.id))
          .returning();
        return row;
      });
    }),

  /** Soft delete only — never hard-delete (audit trail survives). */
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [owned] = await getDb()
        .select({ id: commissary.id })
        .from(commissary)
        .where(
          and(
            eq(commissary.id, input.id),
            eq(commissary.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });

      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(commissary)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(commissary.id, input.id))
          .returning();
        return row;
      });
    }),
});
