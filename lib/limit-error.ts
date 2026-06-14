import { TRPCClientError } from "@trpc/client";

/**
 * True when a mutation failed because the account hit a plan limit
 * (truck/item cap). The server throws TRPCError FORBIDDEN from
 * `assertWithinLimit` — the only FORBIDDEN these create forms can surface.
 */
export function isLimitError(e: unknown): boolean {
  return (
    e instanceof TRPCClientError &&
    (e.data as { code?: string } | null | undefined)?.code === "FORBIDDEN"
  );
}
