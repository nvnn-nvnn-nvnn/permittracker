import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { serverEnv } from "@/lib/env";
import {
  normalizeDocType,
  parseIsoDate,
  type Confidence,
} from "@/lib/extraction/schema";

/**
 * Classify a forwarded email and pull permit details. Reuses the "force a
 * tool, then re-validate" pattern from the OCR pipeline (code note 04).
 * Returns a neutral result if Anthropic isn't configured — inbound still
 * stores the file + makes a draft, just without smart matching.
 */
export type InboundCategory =
  | "renewal_notice"
  | "confirmation"
  | "reminder"
  | "unrelated";

export interface InboundClassification {
  category: InboundCategory;
  documentType: ReturnType<typeof normalizeDocType>;
  jurisdiction: string | null;
  identifier: string | null;
  expirationDate: Date | null;
  holderName: string | null;
  confidence: Confidence;
}

const TOOL = "classify_inbound_compliance_email";

const tool = {
  name: TOOL,
  description:
    "Classify a forwarded email from a food-truck operator and extract any " +
    "compliance document details. Use null when not clearly present.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string",
        enum: ["renewal_notice", "confirmation", "reminder", "unrelated"],
      },
      document_type: { type: ["string", "null"] },
      jurisdiction: { type: ["string", "null"] },
      identifier_number: { type: ["string", "null"] },
      expiration_date: {
        type: ["string", "null"],
        description: "YYYY-MM-DD if present",
      },
      holder_name: { type: ["string", "null"] },
      confidence: { type: "string", enum: ["low", "medium", "high"] },
    },
    required: [
      "category",
      "document_type",
      "jurisdiction",
      "identifier_number",
      "expiration_date",
      "holder_name",
      "confidence",
    ],
    additionalProperties: false,
  },
} as const;

const argsSchema = z.object({
  category: z.enum([
    "renewal_notice",
    "confirmation",
    "reminder",
    "unrelated",
  ]),
  document_type: z.string().nullable(),
  jurisdiction: z.string().nullable(),
  identifier_number: z.string().nullable(),
  expiration_date: z.string().nullable(),
  holder_name: z.string().nullable(),
  confidence: z.enum(["low", "medium", "high"]),
});

const NEUTRAL: InboundClassification = {
  category: "unrelated",
  documentType: null,
  jurisdiction: null,
  identifier: null,
  expirationDate: null,
  holderName: null,
  confidence: "low",
};

export async function classifyInboundEmail(args: {
  subject: string;
  body: string;
}): Promise<InboundClassification> {
  const env = serverEnv();
  if (!env.ANTHROPIC_API_KEY) return NEUTRAL;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 512,
    tools: [tool as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: TOOL },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Subject: ${args.subject}\n\n${args.body}\n\n` +
              "Classify this email and extract any compliance document " +
              "details. Do not guess.",
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === TOOL,
  );
  if (!toolUse) return NEUTRAL;
  const parsed = argsSchema.safeParse(toolUse.input);
  if (!parsed.success) return NEUTRAL;
  const a = parsed.data;

  return {
    category: a.category,
    documentType: normalizeDocType(a.document_type),
    jurisdiction: a.jurisdiction,
    identifier: a.identifier_number,
    expirationDate: parseIsoDate(a.expiration_date),
    holderName: a.holder_name,
    confidence: a.confidence,
  };
}
