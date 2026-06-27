import "server-only";
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { getAccountContext, type AccountContext } from "@/lib/auth/session";
import { assertWithinLimit, assertOperationsAccess } from "@/lib/limits";

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

/**
 * A protected procedure that also enforces the account's plan limit for
 * `kind` BEFORE the handler runs (brief: enforce limits at the tRPC layer).
 * Used by truck.create / item.create.
 */
export function limitedProcedure(kind: "truck" | "item") {
  return protectedProcedure.use(async ({ ctx, next }) => {
    await assertWithinLimit(ctx.account.accountId, kind);
    return next();
  });
}

/** Requires the platform-admin flag (gates the /admin app). */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.account.isPlatformAdmin) {
    throw new TRPCError({ code: "FORBIDDEN" });
  }
  return next();
});

/**
 * Operations-pillar procedure. Enforces two things in one place:
 *  - plan entitlement (the account's plan must include Operations), and
 *  - role: `viewer` members get read-only — they can run queries but not
 *    mutations (detected via the request `type`).
 * Used by the ops / inventory / recipe / purchasing / expenses routers.
 */
export const opsProcedure = protectedProcedure.use(
  async ({ ctx, type, next }) => {
    await assertOperationsAccess(ctx.account.accountId);
    if (type === "mutation" && ctx.account.role === "viewer") {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Viewers have read-only access. Ask an owner or manager.",
      });
    }
    return next();
  },
);
