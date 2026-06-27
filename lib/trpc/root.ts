import { createTRPCRouter } from "@/lib/trpc/trpc";
import { accountRouter } from "./routers/account";
import { truckRouter } from "./routers/truck";
import { commissaryRouter } from "./routers/commissary";
import { venueRouter } from "./routers/venue";
import { eventRouter } from "./routers/event";
import { personRouter } from "./routers/person";
import { itemRouter } from "./routers/item";
import { fileRouter } from "./routers/file";
import { reminderRouter } from "./routers/reminder";
import { billingRouter } from "./routers/billing";
import { inboundRouter } from "./routers/inbound";
import { digestRouter } from "./routers/digest";
import { adminRouter } from "./routers/admin";
import { opsRouter } from "./routers/ops";
import { inventoryRouter } from "./routers/inventory";
import { recipeRouter } from "./routers/recipe";
import { purchasingRouter } from "./routers/purchasing";
import { expensesRouter } from "./routers/expenses";
import { modificationRouter } from "./routers/modification";

export const appRouter = createTRPCRouter({
  account: accountRouter,
  truck: truckRouter,
  commissary: commissaryRouter,
  venue: venueRouter,
  event: eventRouter,
  person: personRouter,
  item: itemRouter,
  file: fileRouter,
  reminder: reminderRouter,
  billing: billingRouter,
  inbound: inboundRouter,
  digest: digestRouter,
  admin: adminRouter,
  ops: opsRouter,
  inventory: inventoryRouter,
  recipe: recipeRouter,
  purchasing: purchasingRouter,
  expenses: expensesRouter,
  modification: modificationRouter,
});

export type AppRouter = typeof appRouter;
