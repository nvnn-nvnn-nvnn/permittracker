import { z } from "zod";

/**
 * Shared input validation. The tRPC routers parse with these; the client
 * forms can import the same shapes so the contract is defined once.
 */

// Form date inputs arrive as "" or "YYYY-MM-DD". Treat "" as "not set".
const optionalDate = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.date().optional(),
);

const optionalTrimmed = (max: number) =>
  z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().max(max).optional(),
  );

// "" / null → undefined, else must be a uuid (form selects send "").
const optionalUuid = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.string().uuid().optional(),
);

export const truckInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  plateOrVin: optionalTrimmed(60),
  jurisdiction: z.string().trim().min(1, "Jurisdiction is required").max(120),
  isActive: z.boolean().default(true),
  commissaryId: optionalUuid,
  notes: optionalTrimmed(2000),
});
export type TruckInput = z.input<typeof truckInput>;

export const commissaryInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  address: optionalTrimmed(240),
  permitExpiration: optionalDate,
  contractExpiration: optionalDate,
  notes: optionalTrimmed(2000),
});
export type CommissaryInput = z.input<typeof commissaryInput>;

export const venueInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  address: optionalTrimmed(240),
  additionalInsuredText: optionalTrimmed(2000),
  coiRequirements: optionalTrimmed(2000),
  notes: optionalTrimmed(2000),
});
export type VenueInput = z.input<typeof venueInput>;

export const eventStatusValues = [
  "interested",
  "applied",
  "waitlisted",
  "accepted",
  "confirmed",
  "rejected",
  "withdrawn",
  "attended",
] as const;

// Form sends "" when no fee entered; cents are computed client-side from dollars.
const optionalCents = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number().int().min(0).max(100_000_000).optional(),
);

export const eventInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  status: z.enum(eventStatusValues).default("interested"),
  venueId: optionalUuid,
  location: optionalTrimmed(240),
  eventDate: optionalDate,
  applicationDeadline: optionalDate,
  applicationUrl: optionalTrimmed(500),
  feeAmountCents: optionalCents,
  notes: optionalTrimmed(2000),
});
export type EventInput = z.input<typeof eventInput>;

export const personInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(160),
  email: optionalTrimmed(160),
  role: optionalTrimmed(80),
  notes: optionalTrimmed(2000),
  // Trucks this person works (drives the cross-truck cert cascade).
  truckIds: z.array(z.string().uuid()).default([]),
});
export type PersonInput = z.input<typeof personInput>;

// Quantity (not currency): fractional units like 1.5 lb are normal.
const optionalQty = z.preprocess(
  (v) => (v === "" || v === null ? undefined : v),
  z.coerce.number().min(0).max(1_000_000).optional(),
);

/** Suggested units for the form datalist (free text — not an enum). */
export const ingredientUnits = [
  "each",
  "lb",
  "oz",
  "case",
  "box",
  "bag",
  "gal",
  "qt",
  "L",
  "dozen",
] as const;

export const ingredientInput = z.object({
  // Per-truck (Option B): each ingredient belongs to a truck.
  truckId: z.string().uuid("Pick a truck"),
  name: z.string().trim().min(1, "Name is required").max(160),
  category: optionalTrimmed(80),
  unit: z.string().trim().min(1).max(20).default("each"),
  // Dollars in the form → converted to integer cents at the router edge.
  unitCost: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(0).max(1_000_000).optional(),
  ),
  onHandQty: z.coerce.number().min(0).max(1_000_000).default(0),
  parLevel: optionalQty,
  reorderToQty: optionalQty,
  supplierName: optionalTrimmed(160),
  notes: optionalTrimmed(2000),
});
export type IngredientInput = z.input<typeof ingredientInput>;

export const recipeLineInput = z.object({
  ingredientId: z.string().uuid(),
  qty: z.coerce.number().min(0).max(1_000_000),
});

export const recipeInput = z.object({
  // Per-truck (Option B): each recipe belongs to a truck.
  truckId: z.string().uuid("Pick a truck"),
  name: z.string().trim().min(1, "Name is required").max(160),
  category: optionalTrimmed(80),
  // Dollars in the form → converted to integer cents at the router edge.
  sellPrice: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(0).max(1_000_000).optional(),
  ),
  notes: optionalTrimmed(2000),
  lines: z.array(recipeLineInput).max(100).default([]),
});
export type RecipeInput = z.input<typeof recipeInput>;

export const purchaseLineInput = z.object({
  ingredientId: z.string().uuid(),
  qty: z.coerce.number().min(0).max(1_000_000),
  // Unit cost in dollars (form) → cents at the router edge.
  unitCost: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(0).max(1_000_000).optional(),
  ),
});

export const purchaseOrderInput = z.object({
  // Optional truck this order restocks; omitted = unassigned/business-wide.
  truckId: optionalUuid,
  supplierName: optionalTrimmed(160),
  notes: optionalTrimmed(2000),
  lines: z.array(purchaseLineInput).max(200).default([]),
});
export type PurchaseOrderInput = z.input<typeof purchaseOrderInput>;

/** Suggested expense categories for the form datalist (free text). */
export const expenseCategories = [
  "Rent",
  "Insurance",
  "Fuel",
  "Supplies",
  "Payroll",
  "Permits & fees",
  "Repairs",
  "Marketing",
  "Commissary",
  "Other",
] as const;

export const expenseInput = z.object({
  // Optional truck; omitted = business-wide overhead.
  truckId: optionalUuid,
  description: z.string().trim().min(1, "Description is required").max(200),
  category: optionalTrimmed(80),
  // Dollars in the form → integer cents at the router edge.
  amount: z.coerce.number().min(0).max(10_000_000),
  spentOn: z.coerce.date(),
  vendorName: optionalTrimmed(160),
  notes: optionalTrimmed(2000),
});
export type ExpenseInput = z.input<typeof expenseInput>;

export const inventoryCountLineInput = z.object({
  ingredientId: z.string().uuid(),
  countedQty: z.coerce.number().min(0).max(1_000_000),
});

export const inventoryCountInput = z.object({
  truckId: z.string().uuid("Pick a truck"),
  countedOn: z.coerce.date(),
  note: optionalTrimmed(500),
  lines: z.array(inventoryCountLineInput).max(2000).default([]),
});
export type InventoryCountInput = z.input<typeof inventoryCountInput>;

export const truckStatusInput = z.object({
  truckId: z.string().uuid(),
  serviceStatus: z.enum(["open", "closed"]).default("closed"),
  currentLocation: optionalTrimmed(200),
  serviceWindow: optionalTrimmed(80),
  statusNote: optionalTrimmed(280),
});
export type TruckStatusInput = z.input<typeof truckStatusInput>;

export const reinspectionStatusValues = [
  "not_required",
  "pending",
  "scheduled",
  "cleared",
] as const;

/** Suggested modification categories for the form datalist. */
export const modificationCategories = [
  "Equipment",
  "Layout",
  "Plumbing / gas",
  "Electrical",
  "Menu",
  "Fire suppression",
  "Other",
] as const;

export const truckModificationInput = z.object({
  truckId: z.string().uuid(),
  description: z.string().trim().min(1, "Describe the change").max(280),
  category: optionalTrimmed(80),
  changedOn: z.coerce.date(),
  reinspectionStatus: z.enum(reinspectionStatusValues).default("not_required"),
  reportedToHealthDept: z.boolean().default(false),
  notes: optionalTrimmed(2000),
});
export type TruckModificationInput = z.input<typeof truckModificationInput>;

export const itemTypeValues = [
  "permit",
  "inspection",
  "certification",
  "coi",
  "vehicle",
] as const;

/** Reminder defaults per item type (days before expiry; 0 = day-of). Brief. */
export function defaultRemindersFor(
  type: (typeof itemTypeValues)[number],
): number[] {
  switch (type) {
    case "permit":
      return [30, 7, 0];
    case "inspection":
      return [30, 7];
    case "certification":
      return [60, 14];
    case "coi":
      return [30, 7];
    case "vehicle":
      return [30, 7];
  }
}

export const itemInput = z.object({
  itemType: z.enum(itemTypeValues),
  subtype: optionalTrimmed(80),
  jurisdiction: z.string().trim().min(1, "Jurisdiction is required").max(120),
  identifier: optionalTrimmed(120),
  issueDate: optionalDate,
  expirationDate: optionalDate,
  // Dollars in the form → we convert to integer cents at the router edge.
  feeAmount: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.coerce.number().min(0).max(1_000_000).optional(),
  ),
  feeDueDate: optionalDate,
  status: z.enum(["active", "pending", "expired"]).default("active"),
  holderType: z.enum(["truck", "person", "business"]).default("truck"),
  holderTruckId: z.preprocess(
    (v) => (v === "" || v === null ? undefined : v),
    z.string().uuid().optional(),
  ),
  holderName: optionalTrimmed(160),
  // Optional dependency on another item (Phase 6 parent→child cascade).
  parentItemId: optionalUuid,
  personId: optionalUuid,
  venueId: optionalUuid,
  notes: optionalTrimmed(2000),
  reminderDaysBefore: z.array(z.number().int().min(0).max(365)).optional(),
});
export type ItemInput = z.input<typeof itemInput>;
