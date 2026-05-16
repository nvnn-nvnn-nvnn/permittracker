import { config } from "dotenv";
import { defineConfig } from "drizzle-kit";

config({ path: ".env.local" });
config({ path: ".env" });

export default defineConfig({
  schema: "./lib/db/schema.ts",
  out: "./supabase/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://placeholder",
  },
  // RLS / audit-trigger SQL is hand-authored and committed alongside generated
  // migrations; we never let drizzle-kit drop those.
  strict: true,
  verbose: true,
});
