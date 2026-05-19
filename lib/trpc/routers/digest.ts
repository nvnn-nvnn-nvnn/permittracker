import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { digestsForAccount } from "@/lib/digest/resolve";
import { currentPeriod } from "@/lib/digest/period";

export const digestRouter = createTRPCRouter({
  /** Published digests for the caller's jurisdictions, this month. */
  forMyAccount: protectedProcedure.query(async ({ ctx }) => {
    const period = currentPeriod();
    const digests = await digestsForAccount(ctx.account.accountId, period);
    return { period, digests };
  }),
});
