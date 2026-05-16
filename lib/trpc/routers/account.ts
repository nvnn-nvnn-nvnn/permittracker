import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";

export const accountRouter = createTRPCRouter({
  /** Current user + active account context. */
  me: protectedProcedure.query(({ ctx }) => ctx.account),
});
