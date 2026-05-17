import "server-only";
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

export type DbTx = PostgresJsDatabase<typeof schema>;

/**
 * Server-only Drizzle client (postgres.js driver).
 *
 * Connects with the service role / direct Postgres URL. RLS still applies at
 * the database for any anon/auth connections; the app additionally filters by
 * account_id on every query (defense in depth — see brief).
 *
 * Lazily instantiated so `next build` and stubbed flows don't require a live
 * DATABASE_URL.
 */
let _db: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function getDb() {
  if (_db) return _db;
  const client = postgres(requireEnv("DATABASE_URL"), { prepare: false });
  _db = drizzle(client, { schema });
  return _db;
}

/**
 * Run a mutation inside one transaction with the audit actor set.
 *
 * The audit trigger reads `current_setting('permitkeep.actor_id')`. We set it
 * transaction-locally (`set_config(..., true)`) so the value can never leak
 * across pooled connections. EVERY truck/item write must go through here so
 * the append-only log attributes the change to the acting user.
 */
export async function withActor<T>(
  actorUserId: string,
  fn: (tx: DbTx) => Promise<T>,
): Promise<T> {
  const db = getDb();
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('permitkeep.actor_id', ${actorUserId}, true)`,
    );
    return fn(tx as unknown as DbTx);
  });
}

export { schema };
