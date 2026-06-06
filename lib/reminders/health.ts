import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { reminderDispatch } from "@/lib/db/schema";

/**
 * Count failed dispatches in the last `windowMinutes`. This is the number the
 * `dispatch-health-alert` cron watches — the same `status = 'failed'` rows the
 * `/admin` dispatch monitor shows, but scoped to a recent window so alerts fire
 * on *new* failures piling up, not on historical ones. Failed rows carry
 * `sentAt = <failure time>` (set in `processDueDispatches`'s catch).
 */
export async function recentDispatchFailures(windowMinutes = 60): Promise<number> {
  const since = new Date(Date.now() - windowMinutes * 60_000);
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(reminderDispatch)
    .where(
      and(
        eq(reminderDispatch.status, "failed"),
        gte(reminderDispatch.sentAt, since),
      ),
    );
  return row?.n ?? 0;
}
