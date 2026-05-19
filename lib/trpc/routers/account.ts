import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import { account } from "@/lib/db/schema";

export const accountRouter = createTRPCRouter({
  /** Current user + active account context. */
  me: protectedProcedure.query(({ ctx }) => ctx.account),

  /** SMS phone + derived forward-to-inbox address for Settings. */
  notificationSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const [a] = await db
      .select({ smsPhone: account.smsPhone })
      .from(account)
      .where(eq(account.id, ctx.account.accountId))
      .limit(1);
    return {
      smsPhone: a?.smsPhone ?? null,
      inboundAddress: `${ctx.account.accountSlug}@inbound.permitkeep.com`,
    };
  }),

  /** Set/clear the SMS reminder recipient (E.164, e.g. +16125551234). */
  setSmsPhone: protectedProcedure
    .input(
      z.object({
        phone: z
          .string()
          .trim()
          .regex(/^\+[1-9]\d{6,14}$/, "Use E.164 format, e.g. +16125551234")
          .or(z.literal("")),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(account)
        .set({
          smsPhone: input.phone === "" ? null : input.phone,
          updatedAt: new Date(),
        })
        .where(eq(account.id, ctx.account.accountId));
      return { ok: true };
    }),
});
