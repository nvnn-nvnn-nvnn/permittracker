import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import { reminderDispatch } from "@/lib/db/schema";
import { processDueDispatches } from "@/lib/reminders/dispatch";

export const reminderRouter = createTRPCRouter({
  /** Reminder history for one item (account-scoped). */
  listForItem: protectedProcedure
    .input(z.object({ complianceItemId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(reminderDispatch)
        .where(
          and(
            eq(reminderDispatch.accountId, ctx.account.accountId),
            eq(reminderDispatch.complianceItemId, input.complianceItemId),
          ),
        )
        .orderBy(asc(reminderDispatch.scheduledFor));
    }),

  /** Manual fallback: process this account's due reminders right now. */
  runDueNow: protectedProcedure.mutation(async ({ ctx }) => {
    return processDueDispatches({ accountId: ctx.account.accountId });
  }),
});
