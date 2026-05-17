import { createTRPCRouter } from "@/lib/trpc/trpc";
import { accountRouter } from "./routers/account";
import { truckRouter } from "./routers/truck";
import { itemRouter } from "./routers/item";

export const appRouter = createTRPCRouter({
  account: accountRouter,
  truck: truckRouter,
  item: itemRouter,
});

export type AppRouter = typeof appRouter;
