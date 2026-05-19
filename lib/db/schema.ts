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

/** Stripe subscription health. `none` = never subscribed (limits still
 *  enforced at the starter floor). Mirrors Stripe subscription.status. */
export const planStatusEnum = pgEnum("plan_status", [
  "none",
  "active",
  "trialing",
  "past_due",
  "canceled",
]);
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
  // --- Billing (Phase 5) ---
  // SMS reminder recipient (Phase 7). Null → SMS dispatches are skipped.
  smsPhone: text("sms_phone"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planStatus: planStatusEnum("plan_status").notNull().default("none"),
  // "month" | "year" | null — drives the displayed price, not authorization.
  planInterval: text("plan_interval"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  conciergePurchasedAt: timestamp("concierge_purchased_at", {
    withTimezone: true,
  }),
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
export type PlanStatus = (typeof planStatusEnum.enumValues)[number];

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
  "file_attachment",
  "commissary",
  "venue",
  "person",
]);

// --- commissary ------------------------------------------------------------
// A third-party licensed kitchen a truck operates out of. Its OWN permit /
// contract expiry cascades onto dependent trucks (Phase 6).

export const commissary = pgTable(
  "commissary",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    // The two dates that cascade onto dependent trucks (brief).
    permitExpiration: date("permit_expiration", { mode: "date" }),
    contractExpiration: date("contract_expiration", { mode: "date" }),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("commissary_account_idx").on(t.accountId)],
);

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
    // Optional commissary dependency (Phase 6 cascade).
    commissaryId: uuid("commissary_id").references(() => commissary.id, {
      onDelete: "set null",
    }),
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
    // Free-text holder for person/business when no Person row applies.
    holderName: text("holder_name"),
    // Phase 8: a cert can belong to a Person (cross-truck cascade), and a
    // COI can be linked to a Venue (additional-insured tracking).
    personId: uuid("person_id").references((): AnyPgColumn => person.id, {
      onDelete: "set null",
    }),
    venueId: uuid("venue_id").references((): AnyPgColumn => venue.id, {
      onDelete: "set null",
    }),
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
export type Commissary = typeof commissary.$inferSelect;
export type ComplianceItem = typeof complianceItem.$inferSelect;
export type NewComplianceItem = typeof complianceItem.$inferInsert;
export type AuditLog = typeof auditLog.$inferSelect;
export type ItemType = (typeof itemTypeEnum.enumValues)[number];
export type ItemStatus = (typeof itemStatusEnum.enumValues)[number];
export type HolderType = (typeof holderTypeEnum.enumValues)[number];

// ===========================================================================
// Phase 3 — File attachments, OCR extraction proposals, cost tracking
// ===========================================================================

export const fileStatusEnum = pgEnum("file_status", [
  "uploading", // signed upload URL issued, bytes not confirmed yet
  "uploaded", // bytes present, extraction not started
  "extracting", // OCR job running
  "extracted", // proposal produced
  "failed", // extraction errored
]);

/** Claude's self-reported confidence per field (brief). */
export const ocrConfidenceEnum = pgEnum("ocr_confidence", [
  "low",
  "medium",
  "high",
]);

/** A proposal is a SUGGESTION. We never overwrite a ComplianceItem from OCR
 *  alone — the user applies or rejects it (brief "never do"). */
export const proposalStatusEnum = pgEnum("proposal_status", [
  "pending",
  "applied",
  "rejected",
]);

// --- file_attachment -------------------------------------------------------
// An uploaded document. May be attached to a ComplianceItem, or unassigned
// (Phase 7 forward-to-inbox creates unassigned files).

export const fileAttachment = pgTable(
  "file_attachment",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    complianceItemId: uuid("compliance_item_id").references(
      () => complianceItem.id,
      { onDelete: "set null" },
    ),
    // Storage path: accounts/{account_id}/items/{item_id}/{file_id}
    storagePath: text("storage_path").notNull(),
    originalFilename: text("original_filename").notNull(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes"),
    status: fileStatusEnum("status").notNull().default("uploading"),
    // Raw text + overall confidence from OCR (populated after extraction).
    extractedText: text("extracted_text"),
    ocrConfidence: ocrConfidenceEnum("ocr_confidence"),
    // Set when expiration-date confidence is low → UI review banner (brief).
    needsManualReview: boolean("needs_manual_review")
      .notNull()
      .default(false),
    extractionError: text("extraction_error"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("file_attachment_account_idx").on(t.accountId),
    index("file_attachment_item_idx").on(t.complianceItemId),
  ],
);

// --- extraction_proposal ---------------------------------------------------
// Structured fields Claude extracted. Surfaced as suggestions; applying is an
// explicit user action that writes to the ComplianceItem via tRPC.

export const extractionProposal = pgTable(
  "extraction_proposal",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    fileId: uuid("file_id")
      .notNull()
      .references(() => fileAttachment.id, { onDelete: "cascade" }),
    status: proposalStatusEnum("status").notNull().default("pending"),
    // Extracted values (nullable — Claude may not find every field).
    documentType: text("document_type"),
    subtype: text("subtype"),
    jurisdiction: text("jurisdiction"),
    identifierNumber: text("identifier_number"),
    issueDate: date("issue_date", { mode: "date" }),
    expirationDate: date("expiration_date", { mode: "date" }),
    renewalFeeAmountCents: integer("renewal_fee_amount_cents"),
    feeDueDate: date("fee_due_date", { mode: "date" }),
    holderName: text("holder_name"),
    // Per-field confidence map: { field: 'low'|'medium'|'high' }.
    fieldConfidence: jsonb("field_confidence")
      .$type<Record<string, "low" | "medium" | "high">>()
      .notNull()
      .default(sql`'{}'::jsonb`),
    appliedAt: timestamp("applied_at", { withTimezone: true }),
    appliedByUserId: uuid("applied_by_user_id").references(
      () => appUser.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => [
    index("extraction_proposal_account_idx").on(t.accountId),
    index("extraction_proposal_file_idx").on(t.fileId),
  ],
);

// --- extraction_cost -------------------------------------------------------
// One row per Claude call. Admin-visible cost dashboard (Phase 9 surfaces it;
// brief requires tracking from Phase 3). Cost stored in micro-USD (1e-6 $)
// to stay integer-exact.

export const extractionCost = pgTable(
  "extraction_cost",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    fileId: uuid("file_id").references(() => fileAttachment.id, {
      onDelete: "set null",
    }),
    model: text("model").notNull(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicroUsd: integer("cost_micro_usd").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("extraction_cost_account_idx").on(t.accountId)],
);

export type FileAttachment = typeof fileAttachment.$inferSelect;
export type ExtractionProposal = typeof extractionProposal.$inferSelect;
export type ExtractionCost = typeof extractionCost.$inferSelect;
export type OcrConfidence = (typeof ocrConfidenceEnum.enumValues)[number];

// ===========================================================================
// Phase 4 — Reminder dispatches
// ===========================================================================
//
// SCOPE DECISION (logged in notes): the brief lists a ReminderSchedule
// entity, but the per-item offsets already live on compliance_item
// (reminder_days_before, Phase 2/3). We treat THAT as the schedule and only
// add reminder_dispatch (the rows actually sent/attempted) to avoid
// duplicating the offsets. Dispatches are hard-deletable (brief allows it)
// and recomputed when the item changes — so no audit trigger here.

export const reminderChannelEnum = pgEnum("reminder_channel", [
  "email",
  "sms",
  "voice",
]);

/** Why this reminder fires: upcoming expiry, or an upcoming fee due date. */
export const reminderKindEnum = pgEnum("reminder_kind", ["expiry", "fee"]);

export const dispatchStatusEnum = pgEnum("dispatch_status", [
  "scheduled", // due in the future, not yet sent
  "sent", // delivered to the channel adapter
  "failed", // adapter threw
  "skipped", // e.g. item archived before send
]);

export const reminderDispatch = pgTable(
  "reminder_dispatch",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    complianceItemId: uuid("compliance_item_id")
      .notNull()
      .references(() => complianceItem.id, { onDelete: "cascade" }),
    channel: reminderChannelEnum("channel").notNull().default("email"),
    kind: reminderKindEnum("kind").notNull().default("expiry"),
    // Days before the target date this reminder represents (0 = day-of).
    offsetDays: integer("offset_days").notNull(),
    scheduledFor: timestamp("scheduled_for", { withTimezone: true }).notNull(),
    status: dispatchStatusEnum("status").notNull().default("scheduled"),
    sentAt: timestamp("sent_at", { withTimezone: true }),
    // Only the user sets this (via the signed acknowledge link). Never auto.
    acknowledgedAt: timestamp("acknowledged_at", { withTimezone: true }),
    error: text("error"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("reminder_dispatch_account_idx").on(t.accountId),
    index("reminder_dispatch_item_idx").on(t.complianceItemId),
    // Cron query: due & still scheduled.
    index("reminder_dispatch_due_idx").on(t.status, t.scheduledFor),
  ],
);

export type ReminderDispatch = typeof reminderDispatch.$inferSelect;
export type ReminderChannel = (typeof reminderChannelEnum.enumValues)[number];
export type DispatchStatus = (typeof dispatchStatusEnum.enumValues)[number];

// ===========================================================================
// Phase 8 — Venues & People (Pro features)
// ===========================================================================

// --- venue -----------------------------------------------------------------
// An event/location that requires a COI with specific additional-insured
// language. COI compliance_items link to it (informational + requirements).

export const venue = pgTable(
  "venue",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    address: text("address"),
    additionalInsuredText: text("additional_insured_text"),
    coiRequirements: text("coi_requirements"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("venue_account_idx").on(t.accountId)],
);

// --- person ----------------------------------------------------------------
// A staff member. May or may not be a User. Their certifications
// (compliance_items with person_id) cascade to assigned active trucks.

export const person = pgTable(
  "person",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    email: text("email"),
    role: text("role"),
    // Optional link to an auth identity (a staff member may also log in).
    userId: uuid("user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("person_account_idx").on(t.accountId)],
);

// --- person_truck ----------------------------------------------------------
// Which trucks a person works. Drives the cross-truck cert cascade.

export const personTruck = pgTable(
  "person_truck",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    personId: uuid("person_id")
      .notNull()
      .references(() => person.id, { onDelete: "cascade" }),
    truckId: uuid("truck_id")
      .notNull()
      .references(() => truck.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("person_truck_uniq").on(t.personId, t.truckId),
    index("person_truck_account_idx").on(t.accountId),
  ],
);

export type Venue = typeof venue.$inferSelect;
export type Person = typeof person.$inferSelect;
export type PersonTruck = typeof personTruck.$inferSelect;
