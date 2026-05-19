import { createTRPCRouter } from "@/lib/trpc/trpc";
import { accountRouter } from "./routers/account";
import { truckRouter } from "./routers/truck";
import { commissaryRouter } from "./routers/commissary";
import { itemRouter } from "./routers/item";
import { fileRouter } from "./routers/file";
import { reminderRouter } from "./routers/reminder";
import { billingRouter } from "./routers/billing";
import { inboundRouter } from "./routers/inbound";
import { adminRouter } from "./routers/admin";

export const appRouter = createTRPCRouter({
  account: accountRouter,
  truck: truckRouter,
  commissary: commissaryRouter,
  item: itemRouter,
  file: fileRouter,
  reminder: reminderRouter,
  billing: billingRouter,
  inbound: inboundRouter,
  admin: adminRouter,
});

export type AppRouter = typeof appRouter;
