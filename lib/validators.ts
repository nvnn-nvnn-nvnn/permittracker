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

export const truckInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  plateOrVin: optionalTrimmed(60),
  jurisdiction: optionalTrimmed(120),
  isActive: z.boolean().default(true),
  notes: optionalTrimmed(2000),
});
export type TruckInput = z.input<typeof truckInput>;

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
  jurisdiction: optionalTrimmed(120),
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
  notes: optionalTrimmed(2000),
  reminderDaysBefore: z.array(z.number().int().min(0).max(365)).optional(),
});
export type ItemInput = z.input<typeof itemInput>;
