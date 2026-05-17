import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb, withActor, type DbTx } from "@/lib/db";
import { complianceItem, truck } from "@/lib/db/schema";
import { itemInput, defaultRemindersFor } from "@/lib/validators";
import type { ItemType } from "@/lib/db/schema";

/** Map the validated form input onto DB columns (dollars → cents, etc.). */
function toColumns(input: z.infer<typeof itemInput>) {
  return {
    itemType: input.itemType,
    subtype: input.subtype,
    jurisdiction: input.jurisdiction,
    identifier: input.identifier,
    issueDate: input.issueDate ?? null,
    expirationDate: input.expirationDate ?? null,
    feeAmountCents:
      input.feeAmount === undefined
        ? null
        : Math.round(input.feeAmount * 100),
    feeDueDate: input.feeDueDate ?? null,
    status: input.status,
    holderType: input.holderType,
    holderTruckId: input.holderTruckId ?? null,
    holderName: input.holderName,
    notes: input.notes,
    reminderDaysBefore:
      input.reminderDaysBefore ??
      defaultRemindersFor(input.itemType as ItemType),
  };
}

/** If the item is attached to a truck, that truck must be in this account. */
async function assertTruckInAccount(
  tx: DbTx,
  truckId: string | undefined,
  accountId: string,
) {
  if (!truckId) return;
  const [t] = await tx
    .select({ id: truck.id })
    .from(truck)
    .where(and(eq(truck.id, truckId), eq(truck.accountId, accountId)))
    .limit(1);
  if (!t) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Truck not found in this account",
    });
  }
}

export const itemRouter = createTRPCRouter({
  list: protectedProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const rows = await db
        .select()
        .from(complianceItem)
        .where(eq(complianceItem.accountId, ctx.account.accountId))
        .orderBy(desc(complianceItem.createdAt));
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
        .from(complianceItem)
        .where(
          and(
            eq(complianceItem.id, input.id),
            eq(complianceItem.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  create: protectedProcedure
    .input(itemInput)
    .mutation(async ({ ctx, input }) => {
      return withActor(ctx.account.userId, async (tx) => {
        await assertTruckInAccount(
          tx,
          input.holderTruckId,
          ctx.account.accountId,
        );
        const [row] = await tx
          .insert(complianceItem)
          .values({
            accountId: ctx.account.accountId,
            createdByUserId: ctx.account.userId,
            ...toColumns(input),
          })
          .returning();
        return row;
      });
    }),

  update: protectedProcedure
    .input(z.object({ id: z.string().uuid(), data: itemInput }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [owned] = await db
        .select({ id: complianceItem.id })
        .from(complianceItem)
        .where(
          and(
            eq(complianceItem.id, input.id),
            eq(complianceItem.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });

      return withActor(ctx.account.userId, async (tx) => {
        await assertTruckInAccount(
          tx,
          input.data.holderTruckId,
          ctx.account.accountId,
        );
        const [row] = await tx
          .update(complianceItem)
          .set({ ...toColumns(input.data), updatedAt: new Date() })
          .where(eq(complianceItem.id, input.id))
          .returning();
        return row;
      });
    }),

  /** Soft delete only — never hard-delete a ComplianceItem (brief). */
  archive: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [owned] = await db
        .select({ id: complianceItem.id })
        .from(complianceItem)
        .where(
          and(
            eq(complianceItem.id, input.id),
            eq(complianceItem.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!owned) throw new TRPCError({ code: "NOT_FOUND" });

      return withActor(ctx.account.userId, async (tx) => {
        const [row] = await tx
          .update(complianceItem)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(complianceItem.id, input.id))
          .returning();
        return row;
      });
    }),
});
