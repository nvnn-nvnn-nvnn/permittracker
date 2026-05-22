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
 * Cached on `globalThis` so Next.js dev hot-reloads can't leak a fresh pool
 * on every module re-evaluation (Postgres error 53300 otherwise). Capped to
 * a small pool because Supabase free-tier connection slots are scarce; this
 * one pool is shared by the whole process.
 */
type Db = ReturnType<typeof drizzle<typeof schema>>;
type Pg = ReturnType<typeof postgres>;

const globalForDb = globalThis as unknown as {
  __pk_pg?: Pg;
  __pk_db?: Db;
};

export function getDb(): Db {
  if (globalForDb.__pk_db) return globalForDb.__pk_db;
  const client =
    globalForDb.__pk_pg ??
    postgres(requireEnv("DATABASE_URL"), {
      prepare: false,
      max: 10,
      idle_timeout: 20,
    });
  globalForDb.__pk_pg = client;
  const db = drizzle(client, { schema });
  globalForDb.__pk_db = db;
  return db;
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
