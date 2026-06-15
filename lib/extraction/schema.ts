import { z } from "zod";

/**
 * The Claude "tool" that forces structured output for document extraction.
 * Defined ONCE here (brief). The model must call this tool; we then validate
 * its arguments with the matching zod schema below before trusting anything.
 *
 * Each field carries Claude's own confidence so the UI can flag low-confidence
 * extractions (esp. expiration date → manual-review banner).
 */

const confidenceValues = ["low", "medium", "high"] as const;

const field = (desc: string) => ({
  type: "object" as const,
  properties: {
    value: {
      type: ["string", "null"],
      description: desc,
    },
    confidence: { type: "string", enum: confidenceValues }
  },
  required: ["value", "confidence"],
  additionalProperties: false,
});

export const EXTRACTION_TOOL_NAME = "record_compliance_document";

export const extractionTool = {
  name: EXTRACTION_TOOL_NAME,
  description:
    "Record the structured fields extracted from a food-truck compliance " +
    "document (permit, inspection report, certification, or certificate of " +
    "insurance). Use null for any field not clearly present. Never guess.",
  input_schema: {
    type: "object" as const,
    properties: {
      document_type: field(
        "One of: permit, inspection, certification, coi, vehicle. Best guess of the document category.",
      ),
      subtype: field(
        "Specific document name, e.g. 'Mobile Food Unit License'.",
      ),
      jurisdiction: field(
        "Issuing authority, e.g. 'City Health Department'.",
      ),
      identifier_number: field("Permit / license / policy number."),
      issue_date: field("Issue date in strict YYYY-MM-DD format."),
      expiration_date: field("Expiration date in strict YYYY-MM-DD format."),
      renewal_fee_amount: field(
        "Renewal fee in US dollars as a plain number string, e.g. '155.00'.",
      ),
      fee_due_date_if_shown: field(
        "Fee due date in YYYY-MM-DD, only if explicitly shown.",
      ),
      holder_name: field(
        "Business / truck / person the document is issued to.",
      ),
      permit_class: field(
        "Permit Class or Category, e.g. 'Mobile Food Unit', 'Class A'"
      ),
    },
    required: [
      "document_type",
      "subtype",
      "jurisdiction",
      "identifier_number",
      "issue_date",
      "expiration_date",
      "renewal_fee_amount",
      "fee_due_date_if_shown",
      "holder_name",
      "permit_class",
    ],
    additionalProperties: false,
  },
} as const;

// --- Validation of Claude's tool arguments ---------------------------------

const fieldSchema = z.object({
  value: z.string().nullable(),
  confidence: z.enum(confidenceValues),
});

export const extractionArgsSchema = z.object({
  document_type: fieldSchema,
  subtype: fieldSchema,
  jurisdiction: fieldSchema,
  identifier_number: fieldSchema,
  issue_date: fieldSchema,
  expiration_date: fieldSchema,
  renewal_fee_amount: fieldSchema,
  fee_due_date_if_shown: fieldSchema,
  holder_name: fieldSchema,
  permit_class: fieldSchema,
});

export type ExtractionArgs = z.infer<typeof extractionArgsSchema>;
export type Confidence = (typeof confidenceValues)[number];

/** Parse "YYYY-MM-DD" → Date (UTC) or null. Defensive: model may stray. */
export function parseIsoDate(v: string | null): Date | null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "$155.00" / "155" → integer cents, or null. */
export function parseMoneyToCents(v: string | null): number | null {
  if (!v) return null;
  const n = Number(v.replace(/[^0-9.]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

const ITEM_TYPES = [
  "permit",
  "inspection",
  "certification",
  "coi",
  "vehicle",
] as const;

/** Normalize Claude's document_type onto our item_type enum. */
export function normalizeDocType(
  v: string | null,
): (typeof ITEM_TYPES)[number] | null {
  if (!v) return null;
  const s = v.toLowerCase();
  if (ITEM_TYPES.includes(s as (typeof ITEM_TYPES)[number]))
    return s as (typeof ITEM_TYPES)[number];
  if (s.includes("insur") || s.includes("coi") || s.includes("liab"))
    return "coi";
  if (s.includes("inspect")) return "inspection";
  if (s.includes("cert")) return "certification";
  if (s.includes("vehicle") || s.includes("vin")) return "vehicle";
  if (s.includes("permit") || s.includes("license")) return "permit";
  return null;
}
