import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb, withActor } from "@/lib/db";
import { event } from "@/lib/db/schema";
import { eventInput, eventStatusValues } from "@/lib/validators";

/** Account-scoped, archive-only, audited — same shape as venue. */
export const eventRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select()
        .from(event)
        .where(eq(event.accountId, ctx.account.accountId))
        .orderBy(desc(event.createdAt));
      return input?.includeArchived
        ? rows
        : rows.filter((r) => r.archivedAt === null);
    }),

  byId: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select()
        .from(event)
        .where(
          and(eq(event.id, input.id), eq(event.accountId, ctx.account.accountId)),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(eventInput)
    .mutation(async ({ ctx, input }) =>
      withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .insert(event)
          .values({
            accountId: ctx.account.accountId,
            name: input.name,
            status: input.status,
            venueId: input.venueId,
            location: input.location,
            eventDate: input.eventDate,
            applicationDeadline: input.applicationDeadline,
            applicationUrl: input.applicationUrl,
            feeAmountCents: input.feeAmountCents,
            notes: input.notes,
            createdByUserId: ctx.account.userId,
          })
          .returning();
        return row;
      }),
    ),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: eventInput }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(event)
          .set({
            name: input.data.name,
            status: input.data.status,
            venueId: input.data.venueId,
            location: input.data.location,
            eventDate: input.data.eventDate,
            applicationDeadline: input.data.applicationDeadline,
            applicationUrl: input.data.applicationUrl,
            feeAmountCents: input.data.feeAmountCents,
            notes: input.data.notes,
            updatedAt: new Date(),
          })
          .where(eq(event.id, input.id))
          .returning();
        return row;
      });
    }),

  /** Quick status change without touching the rest of the record. */
  setStatus: protectedProcedure
    .input(z.object({ id: z.string().uuid(), status: z.enum(eventStatusValues) }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(event)
          .set({ status: input.status, updatedAt: new Date() })
          .where(eq(event.id, input.id))
          .returning();
        return row;
      });
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(event)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(event.id, input.id))
          .returning();
        return row;
      });
    }),
});

/** Tenant guard: 404 unless the event belongs to the caller's account. */
async function assertOwned(accountId: string, id: string): Promise<void> {
  const [owned] = await getDb()
    .select({ id: event.id })
    .from(event)
    .where(and(eq(event.id, id), eq(event.accountId, accountId)))
    .limit(1);
  if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
}
