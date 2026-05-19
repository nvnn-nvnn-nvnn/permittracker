import { z } from "zod";
import { and, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb, withActor, type DbTx } from "@/lib/db";
import { person, personTruck, truck } from "@/lib/db/schema";
import { personInput } from "@/lib/validators";

/** Replace a person's truck assignments (validated to this account). */
async function syncTrucks(
  tx: DbTx,
  accountId: string,
  personId: string,
  truckIds: string[],
) {
  await tx
    .delete(personTruck)
    .where(eq(personTruck.personId, personId));
  if (truckIds.length === 0) return;
  const valid = await tx
    .select({ id: truck.id })
    .from(truck)
    .where(
      and(
        eq(truck.accountId, accountId),
        inArray(truck.id, truckIds),
      ),
    );
  if (valid.length > 0) {
    await tx.insert(personTruck).values(
      valid.map((v) => ({ accountId, personId, truckId: v.id })),
    );
  }
}

export const personRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select()
        .from(person)
        .where(eq(person.accountId, ctx.account.accountId))
        .orderBy(desc(person.createdAt));
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
        .from(person)
        .where(
          and(
            eq(person.id, input.id),
            eq(person.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const links = await db
        .select({ truckId: personTruck.truckId })
        .from(personTruck)
        .where(eq(personTruck.personId, row.id));
      return { ...row, truckIds: links.map((l) => l.truckId) };
    }),

  create: protectedProcedure
    .input(personInput)
    .mutation(async ({ ctx, input }) =>
      withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .insert(person)
          .values({
            accountId: ctx.account.accountId,
            name: input.name,
            email: input.email,
            role: input.role,
            notes: input.notes,
            createdByUserId: ctx.account.userId,
          })
          .returning();
        if (!row) throw new Error("person insert failed");
        await syncTrucks(
          tx,
          ctx.account.accountId,
          row.id,
          input.truckIds ?? [],
        );
        return row;
      }),
    ),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: personInput }))
    .mutation(async ({ ctx, input }) => {
      const [owned] = await getDb()
        .select({ id: person.id })
        .from(person)
        .where(
          and(
            eq(person.id, input.id),
            eq(person.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(person)
          .set({
            name: input.data.name,
            email: input.data.email,
            role: input.data.role,
            notes: input.data.notes,
            updatedAt: new Date(),
          })
          .where(eq(person.id, input.id))
          .returning();
        await syncTrucks(
          tx,
          ctx.account.accountId,
          input.id,
          input.data.truckIds ?? [],
        );
        return row;
      });
    }),

  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const [owned] = await getDb()
        .select({ id: person.id })
        .from(person)
        .where(
          and(
            eq(person.id, input.id),
            eq(person.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(person)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(person.id, input.id))
          .returning();
        return row;
      });
    }),
});
