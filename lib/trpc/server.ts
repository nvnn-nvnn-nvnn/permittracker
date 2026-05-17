import "server-only";
import { appRouter } from "@/lib/trpc/root";
import { createCallerFactory, createTRPCContext } from "@/lib/trpc/trpc";

const createCaller = createCallerFactory(appRouter);

/**
 * Server-side tRPC caller for React Server Components. Reuses the exact same
 * account-scoped procedures the HTTP API uses — no duplicated read logic.
 */
export async function serverApi() {
  return createCaller(await createTRPCContext());
}
