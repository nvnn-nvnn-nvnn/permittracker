import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import { account } from "@/lib/db/schema";
import { processInboundEmail } from "@/lib/inbound/process";
import { acknowledgeBySmsReply } from "@/lib/reminders/dispatch";

/**
 * Dev simulators — exercise the REAL inbound pipelines without Postmark /
 * Twilio. They call the exact same core the webhooks call, scoped to the
 * caller's account, so behaviour is identical to production.
 */
export const inboundRouter = createTRPCRouter({
  simulateEmail: protectedProcedure
    .input(
      z.object({
        subject: z.string().min(1).max(300),
        body: z.string().max(20_000).default(""),
        attachmentName: z.string().max(120).optional(),
        attachmentBase64: z.string().optional(),
        attachmentType: z.string().max(100).optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const attachments =
        input.attachmentName && input.attachmentBase64
          ? [
              {
                filename: input.attachmentName,
                contentType:
                  input.attachmentType ?? "application/octet-stream",
                base64: input.attachmentBase64,
              },
            ]
          : [];
      return processInboundEmail(ctx.account.accountId, {
        from: ctx.account.email,
        subject: input.subject,
        body: input.body,
        attachments,
      });
    }),

  /** Simulate the operator texting "OK" from the account's SMS number. */
  simulateSmsOk: protectedProcedure.mutation(async ({ ctx }) => {
    const db = getDb();
    const [a] = await db
      .select({ smsPhone: account.smsPhone })
      .from(account)
      .where(eq(account.id, ctx.account.accountId))
      .limit(1);
    if (!a?.smsPhone) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Set an SMS phone in Settings first.",
      });
    }
    const r = await acknowledgeBySmsReply(a.smsPhone, "OK");
    if (!r.ok) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "No unacknowledged SMS reminder to acknowledge.",
      });
    }
    return r;
  }),
});
