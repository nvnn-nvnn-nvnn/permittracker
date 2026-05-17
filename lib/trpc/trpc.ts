import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getAccountContext, type AccountContext } from "@/lib/auth/session";

/**
 * tRPC context. The account context is derived from the authenticated
 * Supabase session — account_id is NEVER read from client input.
 */
export async function createTRPCContext() {
  const account = await getAccountContext();
  return { account };
}

type Context = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter: ({ shape }) => shape,
});

export const createTRPCRouter = t.router;
export const createCallerFactory = t.createCallerFactory;
export const publicProcedure = t.procedure;

/** Requires an authenticated user with a resolved account context. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.account) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }
  return next({ ctx: { account: ctx.account satisfies AccountContext } });
});

/** Requires the platform-admin flag (gates the /admin app). */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.account.isPlatformAdmin) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});
