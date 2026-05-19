import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb, withActor } from "@/lib/db";
import { venue } from "@/lib/db/schema";
import { venueInput } from "@/lib/validators";

/** Account-scoped, archive-only, audited — same shape as commissary. */
export const venueRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select()
        .from(venue)
        .where(eq(venue.accountId, ctx.account.accountId))
        .orderBy(desc(venue.createdAt));
      return input?.includeArchived
        ? rows
        : rows.filter((r) => r.archivedAt === null);
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select()
        .from(venue)
        .where(
          and(
            eq(venue.id, input.id),
            eq(venue.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(venueInput)
    .mutation(async ({ ctx, input }) =>
      withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .insert(venue)
          .values({
            accountId: ctx.account.accountId,
            name: input.name,
            address: input.address,
            additionalInsuredText: input.additionalInsuredText,
            coiRequirements: input.coiRequirements,
            notes: input.notes,
            createdByUserId: ctx.account.userId,
          })
          .returning();
        return row;
      }),
    ),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: venueInput }))
    .mutation(async ({ ctx, input }) => {
      const [owned] = await getDb()
        .select({ id: venue.id })
        .from(venue)
        .where(
          and(
            eq(venue.id, input.id),
            eq(venue.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(venue)
          .set({
            name: input.data.name,
            address: input.data.address,
            additionalInsuredText: input.data.additionalInsuredText,
            coiRequirements: input.data.coiRequirements,
            notes: input.data.notes,
            updatedAt: new Date(),
          })
          .where(eq(venue.id, input.id))
          .returning();
        return row;
      });
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [owned] = await getDb()
        .select({ id: venue.id })
        .from(venue)
        .where(
          and(
            eq(venue.id, input.id),
            eq(venue.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(venue)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(venue.id, input.id))
          .returning();
        return row;
      });
    }),
});
