import { z } from "zod";
import { eq } from "drizzle-orm";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import { account } from "@/lib/db/schema";

export const accountRouter = createTRPCRouter({
  /** Current user + active account context. */
  me: protectedProcedure.query(({ ctx }) => ctx.account),

  /** Email/SMS prefs + derived forward-to-inbox address for Settings. */
  notificationSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = getDb();
    const [a] = await db
      .select({ smsPhone: account.smsPhone, notifyEmail: account.notifyEmail })
      .from(account)
      .where(eq(account.id, ctx.account.accountId))
      .limit(1);
    return {
      smsPhone: a?.smsPhone ?? null,
      notifyEmail: a?.notifyEmail ?? true,
      inboundAddress: `${ctx.account.accountSlug}@inbound.permitkeep.com`,
    };
  }),

  /** Toggle email reminders on/off for the account. */
  setEmailNotifications: protectedProcedure
    .input(z.object({ enabled: z.boolean() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(account)
        .set({ notifyEmail: input.enabled, updatedAt: new Date() })
        .where(eq(account.id, ctx.account.accountId));
      return { ok: true };
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
