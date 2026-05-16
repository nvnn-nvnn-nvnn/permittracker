/**
 * Drizzle schema — PermitKeep.
 *
 * Phase 1 scope: Account, User (app_user), Membership.
 * Later phases extend this file (Truck, ComplianceItem, etc.) — keep the
 * shared conventions below consistent.
 *
 * Conventions (from brief):
 *  - uuid `id` PK, `created_at` / `updated_at` timestamptz.
 *  - tenant-scoped tables carry `account_id`.
 *  - soft delete via `archived_at` where deletion is meaningful.
 *  - RLS + app-layer account filtering (defense in depth) — see migrations.
 */
import { sql } from "drizzle-orm";
import {
  boolean,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

// --- Enums -----------------------------------------------------------------

export const planTierEnum = pgEnum("plan_tier", ["starter", "pro", "fleet"]);
export const membershipRoleEnum = pgEnum("membership_role", [
  "owner",
  "manager",
  "viewer",
]);

// --- Shared column groups --------------------------------------------------

const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
};

// --- app_user --------------------------------------------------------------
// Global auth identity. `id` mirrors Supabase `auth.users.id`.

export const appUser = pgTable("app_user", {
  id: uuid("id").primaryKey(),
  email: text("email").notNull(),
  fullName: text("full_name"),
  // Platform-admin flag gates the role-gated /admin app (same Next app).
  isPlatformAdmin: boolean("is_platform_admin").notNull().default(false),
  ...timestamps,
});

// --- account ---------------------------------------------------------------
// The business / tenant root.

export const account = pgTable("account", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: text("name").notNull(),
  slug: text("slug").notNull(),
  planTier: planTierEnum("plan_tier").notNull().default("starter"),
  stripeCustomerId: text("stripe_customer_id"),
  // Nullable to avoid a circular FK at insert time; set after owner exists.
  ownerUserId: uuid("owner_user_id").references(() => appUser.id, {
    onDelete: "set null",
  }),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  ...timestamps,
});

// --- membership ------------------------------------------------------------
// Joins a user to an account with a role. Tenant-scoped via account_id.

export const membership = pgTable(
  "membership",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => appUser.id, { onDelete: "cascade" }),
    role: membershipRoleEnum("role").notNull().default("viewer"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("membership_account_user_uniq").on(t.accountId, t.userId),
  ],
);

// --- Inferred types --------------------------------------------------------

export type AppUser = typeof appUser.$inferSelect;
export type Account = typeof account.$inferSelect;
export type Membership = typeof membership.$inferSelect;
export type MembershipRole = (typeof membershipRoleEnum.enumValues)[number];
export type PlanTier = (typeof planTierEnum.enumValues)[number];
