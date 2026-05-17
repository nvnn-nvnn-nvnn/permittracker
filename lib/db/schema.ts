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
  type AnyPgColumn,
  boolean,
  date,
  index,
  integer,
  jsonb,
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

// ===========================================================================
// Phase 2 — Trucks, Compliance Items, Audit Log
// ===========================================================================

// --- Enums -----------------------------------------------------------------

/** The polymorphic "what kind of thing is this" discriminator. */
export const itemTypeEnum = pgEnum("item_type", [
  "permit",
  "inspection",
  "certification",
  "coi",
  "vehicle",
]);

/** User-facing lifecycle status (separate from date-derived urgency). */
export const itemStatusEnum = pgEnum("item_status", [
  "active",
  "pending",
  "expired",
]);

/** What a compliance item is attached to. Phase 2 supports trucks; person
 *  / business are stored by name until those entities exist (Phase 8). */
export const holderTypeEnum = pgEnum("holder_type", [
  "truck",
  "person",
  "business",
]);

/** Audit actions. `archive` is a soft-delete UPDATE we label distinctly. */
export const auditActionEnum = pgEnum("audit_action", [
  "insert",
  "update",
  "archive",
]);

export const auditEntityEnum = pgEnum("audit_entity", [
  "truck",
  "compliance_item",
]);

// --- truck -----------------------------------------------------------------

export const truck = pgTable(
  "truck",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    plateOrVin: text("plate_or_vin"),
    jurisdiction: text("jurisdiction"),
    // Active = currently operating. Drives RED status (brief).
    isActive: boolean("is_active").notNull().default(true),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    // Soft delete only — never hard-delete (audit trail must survive).
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("truck_account_idx").on(t.accountId)],
);

// --- compliance_item -------------------------------------------------------
// The unified, polymorphic model for permits / inspections / certs / COIs /
// vehicle items. `item_type` is the discriminator.

export const complianceItem = pgTable(
  "compliance_item",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    itemType: itemTypeEnum("item_type").notNull(),
    subtype: text("subtype"),
    jurisdiction: text("jurisdiction"),
    identifier: text("identifier"),
    issueDate: date("issue_date", { mode: "date" }),
    expirationDate: date("expiration_date", { mode: "date" }),
    // Money as integer cents — never floats for currency.
    feeAmountCents: integer("fee_amount_cents"),
    feeDueDate: date("fee_due_date", { mode: "date" }),
    status: itemStatusEnum("status").notNull().default("active"),
    holderType: holderTypeEnum("holder_type").notNull().default("truck"),
    holderTruckId: uuid("holder_truck_id").references(() => truck.id, {
      onDelete: "set null",
    }),
    // Free-text holder for person/business until those entities exist.
    holderName: text("holder_name"),
    // Self-reference for dependency chains (Phase 6 cascades).
    parentItemId: uuid("parent_item_id").references(
      (): AnyPgColumn => complianceItem.id,
      { onDelete: "set null" },
    ),
    notes: text("notes"),
    // Reminder schedule (days-before-expiry). Full ReminderSchedule /
    // Dispatch tables arrive in Phase 4; this stores the per-item offsets.
    reminderDaysBefore: integer("reminder_days_before")
      .array()
      .notNull()
      .default(sql`'{}'::int[]`),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("compliance_item_account_idx").on(t.accountId),
    index("compliance_item_truck_idx").on(t.holderTruckId),
    index("compliance_item_expiration_idx").on(t.expirationDate),
  ],
);

// --- audit_log -------------------------------------------------------------
// APPEND-ONLY. Writes happen ONLY via the Postgres trigger (see migration
// 0003). A BEFORE UPDATE/DELETE trigger raises an exception so not even the
// service role / our app can mutate history. No `updated_at` by design.

export const auditLog = pgTable(
  "audit_log",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id").notNull(),
    actorUserId: uuid("actor_user_id"),
    action: auditActionEnum("action").notNull(),
    entityType: auditEntityEnum("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    priorValue: jsonb("prior_value"),
    newValue: jsonb("new_value"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("audit_log_account_idx").on(t.accountId),
    index("audit_log_entity_idx").on(t.entityType, t.entityId),
  ],
);

// --- Inferred types --------------------------------------------------------

export type Truck = typeof truck.$inferSelect;
export type NewTruck = typeof truck.$inferInsert;
export type ComplianceItem = typeof complianceItem.$inferSelect;
export type NewComplianceItem = typeof complianceItem.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type ItemType = (typeof itemTypeEnum.enumValues)[number];
export type ItemStatus = (typeof itemStatusEnum.enumValues)[number];
export type HolderType = (typeof holderTypeEnum.enumValues)[number];
