import { z } from "zod";
import { and, desc, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import {
  createTRPCRouter,
  limitedProcedure,
  protectedProcedure,
} from "@/lib/trpc/trpc";
import { getDb, withActor, type DbTx } from "@/lib/db";
import {
  commissary,
  complianceItem,
  person,
  personTruck,
  truck,
} from "@/lib/db/schema";
import { truckInput } from "@/lib/validators";

/** A linked commissary must belong to the same account. */
async function assertCommissaryInAccount(
  tx: DbTx,
  commissaryId: string | undefined,
  accountId: string,
) {
  if (!commissaryId) return;
  const [c] = await tx
    .select({ id: commissary.id })
    .from(commissary)
    .where(
      and(
        eq(commissary.id, commissaryId),
        eq(commissary.accountId, accountId),
      ),
    )
    .limit(1);
  if (!c) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Commissary not found in this account",
    });
  }
}

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

  /** Compliance items held by people assigned to this truck (staff certs
   *  that cascade onto it — see the person→truck cascade in lib/status). */
  staffItems: protectedProcedure
    .input(z.object({ truckId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select({ item: complianceItem, personName: person.name })
        .from(complianceItem)
        .innerJoin(
          personTruck,
          eq(personTruck.personId, complianceItem.personId),
        )
        .innerJoin(person, eq(person.id, complianceItem.personId))
        .where(
          and(
            eq(complianceItem.accountId, ctx.account.accountId),
            eq(personTruck.truckId, input.truckId),
            isNull(complianceItem.archivedAt),
          ),
        );
    }),

  create: limitedProcedure("truck")
    .input(truckInput)
    .mutation(async ({ ctx, input }) => {
      return withActor(ctx.account.userId, async (tx) => {
        await assertCommissaryInAccount(
          tx,
          input.commissaryId,
          ctx.account.accountId,
        );
        const [row] = await tx
          .insert(truck)
          .values({
            accountId: ctx.account.accountId,
            name: input.name,
            plateOrVin: input.plateOrVin,
            jurisdiction: input.jurisdiction,
            isActive: input.isActive ?? true,
            commissaryId: input.commissaryId ?? null,
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
        await assertCommissaryInAccount(
          tx,
          input.data.commissaryId,
          ctx.account.accountId,
        );
        const [row] = await tx
          .update(truck)
          .set({
            name: input.data.name,
            plateOrVin: input.data.plateOrVin,
            jurisdiction: input.data.jurisdiction,
            isActive: input.data.isActive ?? true,
            commissaryId: input.data.commissaryId ?? null,
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



  rename: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(120),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      // Ownership re-check — does this id belong to MY account?
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
          .set({ name: input.name, updatedAt: new Date() })
          .where(eq(truck.id, input.id))
          .returning();
        return row;
      });
    }),
});
