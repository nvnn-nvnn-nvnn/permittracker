import { createTRPCRouter } from "@/lib/trpc/trpc";
import { accountRouter } from "./routers/account";
import { truckRouter } from "./routers/truck";
import { itemRouter } from "./routers/item";
import { fileRouter } from "./routers/file";
import { reminderRouter } from "./routers/reminder";
import { billingRouter } from "./routers/billing";
import { adminRouter } from "./routers/admin";

export const appRouter = createTRPCRouter({
  account: accountRouter,
  truck: truckRouter,
  item: itemRouter,
  file: fileRouter,
  reminder: reminderRouter,
  billing: billingRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
