import "server-only";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

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

export { schema };
