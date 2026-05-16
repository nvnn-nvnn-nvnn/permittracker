import { createTRPCRouter } from "@/lib/trpc/trpc";
import { accountRouter } from "./routers/account";

export const appRouter = createTRPCRouter({
  account: accountRouter,
});

export type AppRouter = typeof appRouter;
