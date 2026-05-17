import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { serverEnv } from "@/lib/env";
import {
  EXTRACTION_TOOL_NAME,
  extractionArgsSchema,
  extractionTool,
  type ExtractionArgs,
} from "./schema";

/** Thrown when the integration isn't configured (no API key yet). */
export class ExtractionConfigError extends Error {}
/** Thrown when Claude responded but not in the expected structured form. */
export class ExtractionParseError extends Error {}

export interface ExtractionResult {
  args: ExtractionArgs;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costMicroUsd: number;
}

// Published price per 1M tokens (USD). Stored as micro-USD per token.
// Fallback covers unknown/future model ids conservatively.
const PRICING: Record<string, { in: number; out: number }> = {
  "claude-sonnet-4-6": { in: 3, out: 15 },
  "claude-opus-4-7": { in: 15, out: 75 },
  "claude-haiku-4-5-20251001": { in: 1, out: 5 },
};
function microUsd(model: string, inTok: number, outTok: number): number {
  const p = PRICING[model] ?? { in: 3, out: 15 };
  // price$/1e6 tok → micro-usd/tok = price (since 1e6 tok * 1e-6 $/µ$ ...)
  return Math.round(inTok * p.in + outTok * p.out);
}

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

function contentBlock(
  bytesBase64: string,
  mimeType: string,
): Anthropic.ContentBlockParam[] {
  if (mimeType === "application/pdf") {
    return [
      {
        type: "document",
        source: {
          type: "base64",
          media_type: "application/pdf",
          data: bytesBase64,
        },
      },
    ];
  }
  if (IMAGE_TYPES.has(mimeType)) {
    return [
      {
        type: "image",
        source: {
          type: "base64",
          // SDK enums these media types; our Set already constrained it.
          media_type: mimeType as
            | "image/jpeg"
            | "image/png"
            | "image/gif"
            | "image/webp",
          data: bytesBase64,
        },
      },
    ];
  }
  throw new ExtractionParseError(`Unsupported file type: ${mimeType}`);
}

/**
 * Send a document to Claude and get structured, validated fields back.
 * Pure-ish: no DB writes here — the caller persists the proposal + cost.
 */
export async function extractDocument(params: {
  bytesBase64: string;
  mimeType: string;
}): Promise<ExtractionResult> {
  const env = serverEnv();
  if (!env.ANTHROPIC_API_KEY) {
    throw new ExtractionConfigError(
      "ANTHROPIC_API_KEY is not set — add it to .env.local to enable OCR.",
    );
  }
  const model = env.ANTHROPIC_MODEL;
  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  const message = await client.messages.create({
    model,
    max_tokens: 1024,
    // Our tool is a valid JSON-schema literal; the only mismatch is TS
    // readonly-vs-mutable on the `as const` arrays, so this cast is safe.
    tools: [extractionTool as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text" as const,
            text:
              "Extract the compliance fields from this document. Use null " +
              "for anything not clearly present. Do not guess dates or " +
              "numbers. Report your confidence honestly per field.",
          },
          ...contentBlock(params.bytesBase64, params.mimeType),
        ],
      },
    ],
  });

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === EXTRACTION_TOOL_NAME,
  );
  if (!toolUse) {
    throw new ExtractionParseError("Claude did not return structured output.");
  }

  const parsed = extractionArgsSchema.safeParse(toolUse.input);
  if (!parsed.success) {
    throw new ExtractionParseError(
      `Structured output failed validation: ${parsed.error.message}`,
    );
  }

  const inputTokens = message.usage.input_tokens;
  const outputTokens = message.usage.output_tokens;
  return {
    args: parsed.data,
    model,
    inputTokens,
    outputTokens,
    costMicroUsd: microUsd(model, inputTokens, outputTokens),
  };
}
