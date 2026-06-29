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
  doublePrecision,
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

/** Vendor-side application lifecycle for a prospective event. */
export const eventStatusEnum = pgEnum("event_status", [
  "interested",
  "applied",
  "waitlisted",
  "accepted",
  "confirmed",
  "rejected",
  "withdrawn",
  "attended",
]);

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
  // Email reminder toggle. Default on; when false, email reminder dispatches
  // are skipped (transactional/auth emails are unaffected).
  notifyEmail: boolean("notify_email").notNull().default(true),
  // --- Billing (Phase 5) ---
  // SMS reminder recipient (Phase 7). Null → SMS dispatches are skipped.
  smsPhone: text("sms_phone"),
  stripeCustomerId: text("stripe_customer_id"),
  stripeSubscriptionId: text("stripe_subscription_id"),
  planStatus: planStatusEnum("plan_status").notNull().default("none"),
  // "month" | "year" | null — drives the displayed price, not authorization.
  planInterval: text("plan_interval"),
  currentPeriodEnd: timestamp("current_period_end", { withTimezone: true }),
  // Stamped once when the account's free trial begins (status → trialing).
  // Durable trial-eligibility marker so a cancel→resubscribe can't farm a new
  // 14-day trial each time. The trial END date during a trial is
  // current_period_end. See 00-decisions.md (2026-06-25, trial confirmed).
  trialStartedAt: timestamp("trial_started_at", { withTimezone: true }),
  conciergePurchasedAt: timestamp("concierge_purchased_at", {
    withTimezone: true,
  }),
  // Phase 9: platform-admin marks concierge onboarding done → off the queue.
  conciergeCompletedAt: timestamp("concierge_completed_at", {
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
    // Permit Class
    permitClass: text("permit_class"),
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

    // permit check schema implementation
    permitClass: text("permit_class")
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

// --- event -----------------------------------------------------------------
// A prospective event the vendor wants to apply to / work, with an application
// status pipeline. Optionally links to a venue (which carries the COI /
// additional-insured requirements that kick in once accepted).

export const event = pgTable(
  "event",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    status: eventStatusEnum("status").notNull().default("interested"),
    // Optional link to the venue's recurring COI requirements.
    venueId: uuid("venue_id").references((): AnyPgColumn => venue.id, {
      onDelete: "set null",
    }),
    location: text("location"),
    eventDate: date("event_date", { mode: "date" }),
    applicationDeadline: date("application_deadline", { mode: "date" }),
    applicationUrl: text("application_url"),
    // Money as integer cents — never floats for currency.
    feeAmountCents: integer("fee_amount_cents"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("event_account_idx").on(t.accountId),
    index("event_status_idx").on(t.status),
  ],
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
export type Event = typeof event.$inferSelect;
export type EventStatus = (typeof eventStatusEnum.enumValues)[number];
export type Person = typeof person.$inferSelect;
export type PersonTruck = typeof personTruck.$inferSelect;

// ===========================================================================
// Phase 10 — Inspection-prep digest
// ===========================================================================
//
// Platform content, NOT tenant-scoped: one digest per (jurisdiction, period)
// shared by every account in that jurisdiction. Claude-generated, then
// admin-editable. RLS = readable by any authenticated user (shared
// reference content), writes via service/admin only — see migration.

export const digestStatusEnum = pgEnum("digest_status", [
  "draft",
  "published",
]);

export const jurisdictionDigest = pgTable(
  "jurisdiction_digest",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    jurisdiction: text("jurisdiction").notNull(),
    // Month key, e.g. "2026-05" — one digest per jurisdiction per month.
    period: text("period").notNull(),
    title: text("title").notNull(),
    contentMarkdown: text("content_markdown").notNull(),
    generatedByModel: text("generated_by_model"),
    status: digestStatusEnum("status").notNull().default("draft"),
    editedByUserId: uuid("edited_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("jurisdiction_digest_uniq").on(t.jurisdiction, t.period),
  ],
);

export type JurisdictionDigest = typeof jurisdictionDigest.$inferSelect;

// ===========================================================================
// Account deletion ledger (GDPR/CCPA proof-of-erasure)
// ===========================================================================
//
// An append-only RECORD that an account erasure happened. Intentionally has
// NO foreign keys: it must survive the very cascade that erases the account
// and outlive the deleted owner — exactly like audit_log. name/slug are
// denormalized so the row stays meaningful after the account itself is gone.

export const accountDeletionLog = pgTable("account_deletion_log", {
  id: uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  accountId: uuid("account_id").notNull(),
  accountName: text("account_name"),
  accountSlug: text("account_slug"),
  // The user who performed the deletion (admin now, owner for self-serve
  // later). Plain uuid, no FK — the ledger must not depend on app_user.
  deletedByUserId: uuid("deleted_by_user_id"),
  reason: text("reason"),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export type AccountDeletionLog = typeof accountDeletionLog.$inferSelect;

// ===========================================================================
// Operations pillar — Slice 1: Square sales sync + weekly P&L
// ===========================================================================
//
// SCOPE (logged in 00-decisions.md, 2026-06-25): the app gains a second pillar,
// "Stay profitable", connecting the tools operators already use (Square now,
// QuickBooks later). Slice 1 = Square sales sync + a weekly P&L dashboard.
//
// Like reminder_dispatch, `sales_day` is SYNCED, recomputable data: upserted on
// every sync and not audited (no audit_log entity). `square_connection` is
// per-account config (like the billing columns on `account`) — not audited.
// Both are RLS member-select; all writes go through the service connection.

/** Where a sales figure came from. `manual` reserved for later slices. */
export const salesSourceEnum = pgEnum("sales_source", ["square", "manual"]);

// --- square_connection -----------------------------------------------------
// One row per account. Records the linked Square merchant/location and last
// sync. Slice 1 does NOT persist OAuth tokens — the stub needs none, and the
// real adapter reads SQUARE_ACCESS_TOKEN from env (encrypted token storage
// arrives with full OAuth). `connected` flips false on disconnect.

export const squareConnection = pgTable(
  "square_connection",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    // Per-truck (multi-truck): each truck connects its own Square location.
    // Nullable for legacy/account-level rows; new connects always set it.
    truckId: uuid("truck_id").references(() => truck.id, {
      onDelete: "cascade",
    }),
    connected: boolean("connected").notNull().default(true),
    merchantId: text("merchant_id"),
    locationId: text("location_id"),
    locationName: text("location_name"),
    // "sandbox" | "production" — mirrors SQUARE_ENVIRONMENT at connect time.
    environment: text("environment"),
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),
    connectedByUserId: uuid("connected_by_user_id").references(
      () => appUser.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("square_connection_truck_uniq").on(t.truckId),
    index("square_connection_account_idx").on(t.accountId),
  ],
);

// --- sales_day -------------------------------------------------------------
// One row per (account, source, business date). The daily rollup the weekly
// P&L aggregates. Money as integer cents — never floats. net = gross - refunds.

export const salesDay = pgTable(
  "sales_day",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    // The truck (Square location) these sales belong to. Nullable for legacy.
    truckId: uuid("truck_id").references(() => truck.id, {
      onDelete: "cascade",
    }),
    source: salesSourceEnum("source").notNull().default("square"),
    businessDate: date("business_date", { mode: "date" }).notNull(),
    grossSalesCents: integer("gross_sales_cents").notNull().default(0),
    refundsCents: integer("refunds_cents").notNull().default(0),
    netSalesCents: integer("net_sales_cents").notNull().default(0),
    taxCents: integer("tax_cents").notNull().default(0),
    tipsCents: integer("tips_cents").notNull().default(0),
    discountsCents: integer("discounts_cents").notNull().default(0),
    transactionCount: integer("transaction_count").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sales_day_account_truck_source_date_uniq").on(
      t.accountId,
      t.truckId,
      t.source,
      t.businessDate,
    ),
    index("sales_day_account_date_idx").on(t.accountId, t.businessDate),
  ],
);

// --- square_oauth ----------------------------------------------------------
// Per-account Square OAuth connection (one merchant per account). Access +
// refresh tokens are stored ENCRYPTED (lib/crypto/secret). RLS denies all
// reads to authenticated users — only the service connection touches tokens.
// `square_connection` (per truck) maps a truck to a location within this
// merchant.

export const squareOauth = pgTable(
  "square_oauth",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    merchantId: text("merchant_id"),
    environment: text("environment").notNull().default("sandbox"),
    accessTokenEnc: text("access_token_enc").notNull(),
    refreshTokenEnc: text("refresh_token_enc"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    scopes: text("scopes"),
    connectedByUserId: uuid("connected_by_user_id").references(
      () => appUser.id,
      { onDelete: "set null" },
    ),
    ...timestamps,
  },
  (t) => [uniqueIndex("square_oauth_account_uniq").on(t.accountId)],
);

export type SquareOauth = typeof squareOauth.$inferSelect;
export type SquareConnection = typeof squareConnection.$inferSelect;
export type SalesDay = typeof salesDay.$inferSelect;
export type NewSalesDay = typeof salesDay.$inferInsert;
export type SalesSource = (typeof salesSourceEnum.enumValues)[number];

// --- sales_item_day --------------------------------------------------------
// Per-item daily sales (Square order line items). Powers item-level reports,
// menu-simplification analytics, and (later) per-recipe COGS attribution.
// Synced/recomputable like sales_day; RLS member-select, not audited.

export const salesItemDay = pgTable(
  "sales_item_day",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    truckId: uuid("truck_id").references(() => truck.id, {
      onDelete: "cascade",
    }),
    source: salesSourceEnum("source").notNull().default("square"),
    businessDate: date("business_date", { mode: "date" }).notNull(),
    // Menu item name as it appears in the POS; the join key to recipes.
    itemName: text("item_name").notNull(),
    // Square catalog object id when available (stub has none).
    squareItemId: text("square_item_id"),
    qtySold: doublePrecision("qty_sold").notNull().default(0),
    grossSalesCents: integer("gross_sales_cents").notNull().default(0),
    syncedAt: timestamp("synced_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("sales_item_day_uniq").on(
      t.accountId,
      t.truckId,
      t.source,
      t.businessDate,
      t.itemName,
    ),
    index("sales_item_day_account_date_idx").on(t.accountId, t.businessDate),
  ],
);

export type SalesItemDay = typeof salesItemDay.$inferSelect;

// ===========================================================================
// Operations pillar — Slice 2a: Inventory (ingredients)
// ===========================================================================
//
// Master inventory data the operator edits. Account-scoped, archive-only, RLS
// member-select. Like the rest of the ops pillar it is NOT wired to the
// compliance audit_log (that trigger guards legal/compliance records; ops is
// operational). Quantities use double precision (NOT currency — fractional
// units like 1.5 lb are normal); money stays integer cents (`unit_cost_cents`).

export const ingredient = pgTable(
  "ingredient",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    // Per-truck (Option B): each truck owns its ingredients. Nullable for
    // legacy/unassigned rows; new ingredients always set it.
    truckId: uuid("truck_id").references(() => truck.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    category: text("category"),
    // Stock-keeping unit of measure, e.g. "lb", "each", "case", "gal".
    unit: text("unit").notNull().default("each"),
    // Cost per `unit`, integer cents.
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    onHandQty: doublePrecision("on_hand_qty").notNull().default(0),
    // Reorder threshold; null = not stock-tracked (no low-stock alerts).
    parLevel: doublePrecision("par_level"),
    // Target on-hand quantity after a reorder (drives suggested order qty).
    reorderToQty: doublePrecision("reorder_to_qty"),
    supplierName: text("supplier_name"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("ingredient_account_idx").on(t.accountId)],
);

export type Ingredient = typeof ingredient.$inferSelect;
export type NewIngredient = typeof ingredient.$inferInsert;

// ===========================================================================
// Operations pillar — Slice 2b: Recipes (menu items) + ingredient usage
// ===========================================================================
//
// A recipe is a sellable menu item with a price and a bill of materials
// (recipe_ingredient lines). COGS = Σ(line.qty × ingredient.unit_cost_cents);
// margin = sell_price − COGS. Account-scoped, archive-only, RLS member-select,
// not audited (operational). recipe_ingredient is a hard-deletable join
// replaced on each recipe save (like person_truck) — no audit trigger.

export const recipe = pgTable(
  "recipe",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    // Per-truck (Option B): each truck owns its recipes/menu.
    truckId: uuid("truck_id").references(() => truck.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    category: text("category"),
    // Menu price, integer cents.
    sellPriceCents: integer("sell_price_cents").notNull().default(0),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [index("recipe_account_idx").on(t.accountId)],
);

export const recipeIngredient = pgTable(
  "recipe_ingredient",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    recipeId: uuid("recipe_id")
      .notNull()
      .references(() => recipe.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredient.id, { onDelete: "cascade" }),
    // Quantity of the ingredient (in the ingredient's unit) per one sold item.
    qty: doublePrecision("qty").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("recipe_ingredient_uniq").on(t.recipeId, t.ingredientId),
    index("recipe_ingredient_account_idx").on(t.accountId),
    index("recipe_ingredient_recipe_idx").on(t.recipeId),
  ],
);

export type Recipe = typeof recipe.$inferSelect;
export type NewRecipe = typeof recipe.$inferInsert;
export type RecipeIngredient = typeof recipeIngredient.$inferSelect;

// ===========================================================================
// Operations pillar — Slice 2c: Purchasing (reorder lists / purchase orders)
// ===========================================================================
//
// A purchase order the manager builds (or auto-seeds from below-par stock),
// moves draft → ordered → received. Receiving bumps ingredient.on_hand_qty.
// Account-scoped, archive-only, RLS member-select, not audited. Items are a
// hard-deletable join replaced on save while the order is still editable.

export const purchaseOrderStatusEnum = pgEnum("purchase_order_status", [
  "draft",
  "ordered",
  "received",
  "canceled",
]);

export const purchaseOrder = pgTable(
  "purchase_order",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    // Which truck's stock this order restocks; NULL = unassigned/business-wide.
    truckId: uuid("truck_id").references(() => truck.id, {
      onDelete: "set null",
    }),
    supplierName: text("supplier_name"),
    status: purchaseOrderStatusEnum("status").notNull().default("draft"),
    notes: text("notes"),
    orderedAt: timestamp("ordered_at", { withTimezone: true }),
    // Set once when the order is received; gates the one-time stock bump.
    receivedAt: timestamp("received_at", { withTimezone: true }),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("purchase_order_account_idx").on(t.accountId),
    index("purchase_order_status_idx").on(t.status),
  ],
);

export const purchaseOrderItem = pgTable(
  "purchase_order_item",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    purchaseOrderId: uuid("purchase_order_id")
      .notNull()
      .references(() => purchaseOrder.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredient.id, { onDelete: "cascade" }),
    qty: doublePrecision("qty").notNull().default(0),
    // Cost snapshot at order time (ingredient cost can change later).
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("purchase_order_item_uniq").on(
      t.purchaseOrderId,
      t.ingredientId,
    ),
    index("purchase_order_item_account_idx").on(t.accountId),
    index("purchase_order_item_po_idx").on(t.purchaseOrderId),
  ],
);

export type PurchaseOrder = typeof purchaseOrder.$inferSelect;
export type PurchaseOrderItem = typeof purchaseOrderItem.$inferSelect;
export type PurchaseOrderStatus =
  (typeof purchaseOrderStatusEnum.enumValues)[number];

// ===========================================================================
// Operations pillar — Slice 3: Overhead expense ledger (QuickBooks fallback)
// ===========================================================================
//
// A barebones bookkeeping ledger: dated operating expenses (rent, insurance,
// fuel, …) that feed the weekly P&L's overhead line. Account-scoped,
// archive-only, RLS member-select, not audited. Money in integer cents.

export const expense = pgTable(
  "expense",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    // Optional truck attribution; NULL = business-wide overhead (rollup only).
    truckId: uuid("truck_id").references(() => truck.id, {
      onDelete: "set null",
    }),
    description: text("description").notNull(),
    category: text("category"),
    amountCents: integer("amount_cents").notNull().default(0),
    // The date the expense applies to (drives which P&L week it lands in).
    spentOn: date("spent_on", { mode: "date" }).notNull(),
    vendorName: text("vendor_name"),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("expense_account_idx").on(t.accountId),
    index("expense_spent_on_idx").on(t.spentOn),
  ],
);

export type Expense = typeof expense.$inferSelect;
export type NewExpense = typeof expense.$inferInsert;

// ===========================================================================
// Operations pillar — Tier A step 3: Inventory counts (snapshots)
// ===========================================================================
//
// A physical count at a point in time. Stores the counted value (snapshot) +
// per-ingredient counted quantities, and reconciles ingredient.on_hand_qty to
// the counted figures. Two counts + purchases between them give ACTUAL food
// cost = opening + purchases − closing (captures waste/shrink). Account-scoped,
// RLS member-select, not audited; lines are a hard-deletable child of the count.

export const inventoryCount = pgTable(
  "inventory_count",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    // Which truck's stock was counted (Option B).
    truckId: uuid("truck_id").references(() => truck.id, {
      onDelete: "cascade",
    }),
    countedOn: date("counted_on", { mode: "date" }).notNull(),
    // Snapshot of total inventory value (Σ counted qty × unit cost) in cents.
    totalValueCents: integer("total_value_cents").notNull().default(0),
    note: text("note"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index("inventory_count_account_idx").on(t.accountId),
    index("inventory_count_date_idx").on(t.accountId, t.countedOn),
  ],
);

export const inventoryCountLine = pgTable(
  "inventory_count_line",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    countId: uuid("count_id")
      .notNull()
      .references(() => inventoryCount.id, { onDelete: "cascade" }),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredient.id, { onDelete: "cascade" }),
    countedQty: doublePrecision("counted_qty").notNull().default(0),
    // Unit cost snapshot at count time.
    unitCostCents: integer("unit_cost_cents").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("inventory_count_line_uniq").on(t.countId, t.ingredientId),
    index("inventory_count_line_account_idx").on(t.accountId),
    index("inventory_count_line_count_idx").on(t.countId),
  ],
);

export type InventoryCount = typeof inventoryCount.$inferSelect;
export type InventoryCountLine = typeof inventoryCountLine.$inferSelect;

// ===========================================================================
// Operations pillar — v1.1: Auto-depletion usage ledger
// ===========================================================================
//
// Theoretical ingredient usage derived from Square item sales × recipes. One
// row per (account, source, business date, ingredient) holding the cumulative
// qty used that day. The sync engine reconciles on-hand by the DELTA between
// this ledger and freshly-computed usage, so re-syncs never double-deplete
// (idempotent). Doubles as the "inventory used / theoretical food cost" report.
// Account-scoped, RLS member-select, not audited.

export const inventoryUsage = pgTable(
  "inventory_usage",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    // The truck whose stock this usage depletes (Option B).
    truckId: uuid("truck_id").references(() => truck.id, {
      onDelete: "cascade",
    }),
    source: salesSourceEnum("source").notNull().default("square"),
    businessDate: date("business_date", { mode: "date" }).notNull(),
    ingredientId: uuid("ingredient_id")
      .notNull()
      .references(() => ingredient.id, { onDelete: "cascade" }),
    /** Cumulative quantity used on this day (recipe qty × items sold). */
    qtyUsed: doublePrecision("qty_used").notNull().default(0),
    /** qtyUsed × ingredient unit cost at compute time (theoretical COGS). */
    costCents: integer("cost_cents").notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    uniqueIndex("inventory_usage_uniq").on(
      t.accountId,
      t.source,
      t.businessDate,
      t.ingredientId,
    ),
    index("inventory_usage_account_date_idx").on(t.accountId, t.businessDate),
    index("inventory_usage_ingredient_idx").on(t.ingredientId),
  ],
);

export type InventoryUsage = typeof inventoryUsage.$inferSelect;

// ===========================================================================
// Operations pillar — Tier A step 5: Truck service status (location / window)
// ===========================================================================
//
// Current "are we serving / where" status, 1:1 with a truck. Updated often
// (daily / multiple times a day), so it is a SEPARATE table — NOT columns on
// `truck` (which is audited) — to keep location pings out of the compliance
// audit_log. RLS member-select; not audited.

export const serviceStatusEnum = pgEnum("service_status", ["open", "closed"]);

export const truckStatus = pgTable(
  "truck_status",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    truckId: uuid("truck_id")
      .notNull()
      .references(() => truck.id, { onDelete: "cascade" }),
    serviceStatus: serviceStatusEnum("service_status")
      .notNull()
      .default("closed"),
    // Where it's parked today, e.g. "Mears Park, St Paul".
    currentLocation: text("current_location"),
    // Free-text service window, e.g. "11am–2pm".
    serviceWindow: text("service_window"),
    statusNote: text("status_note"),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [uniqueIndex("truck_status_truck_uniq").on(t.truckId)],
);

export type TruckStatus = typeof truckStatus.$inferSelect;
export type ServiceStatus = (typeof serviceStatusEnum.enumValues)[number];

// ===========================================================================
// Compliance pillar — Tier A step 6: Truck modification / health-dept log
// ===========================================================================
//
// A dated record of equipment/layout/menu changes to a truck that may trigger
// re-inspection — so the operator has proof of what changed and when to show
// the health department. Account-scoped, archive-only, RLS member-select.
// It is itself an append-style log (entries aren't edited as history); not
// wired to the formal audit_log trigger (would need an enum + trigger
// migration) — logged as a decision.

export const reinspectionStatusEnum = pgEnum("reinspection_status", [
  "not_required",
  "pending",
  "scheduled",
  "cleared",
]);

export const truckModification = pgTable(
  "truck_modification",
  {
    id: uuid("id")
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    accountId: uuid("account_id")
      .notNull()
      .references(() => account.id, { onDelete: "cascade" }),
    truckId: uuid("truck_id")
      .notNull()
      .references(() => truck.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    // Free text + datalist: Equipment, Layout, Plumbing/Gas, Electrical, Menu…
    category: text("category"),
    changedOn: date("changed_on", { mode: "date" }).notNull(),
    reinspectionStatus: reinspectionStatusEnum("reinspection_status")
      .notNull()
      .default("not_required"),
    reportedToHealthDept: boolean("reported_to_health_dept")
      .notNull()
      .default(false),
    notes: text("notes"),
    createdByUserId: uuid("created_by_user_id").references(() => appUser.id, {
      onDelete: "set null",
    }),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    ...timestamps,
  },
  (t) => [
    index("truck_modification_account_idx").on(t.accountId),
    index("truck_modification_truck_idx").on(t.truckId),
  ],
);

export type TruckModification = typeof truckModification.$inferSelect;
export type ReinspectionStatus =
  (typeof reinspectionStatusEnum.enumValues)[number];
