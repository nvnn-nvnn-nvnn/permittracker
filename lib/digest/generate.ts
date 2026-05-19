import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { jurisdictionDigest } from "@/lib/db/schema";
import { serverEnv } from "@/lib/env";
import { periodLabel } from "./period";

/**
 * Generate (or reuse) the monthly inspection-prep digest for one
 * jurisdiction. Claude-authored, advisory-only content stored as markdown.
 * Idempotent per (jurisdiction, period): if a row exists we keep it (admins
 * may have edited it).
 */
const TOOL = "write_inspection_prep_digest";

const tool = {
  name: TOOL,
  description:
    "Write a short monthly inspection-prep digest for food-truck operators " +
    "in a specific jurisdiction. Practical, encouraging, non-legal advice.",
  input_schema: {
    type: "object" as const,
    properties: {
      title: { type: "string" },
      sections: {
        type: "array",
        items: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string", description: "1–3 short sentences" },
          },
          required: ["heading", "body"],
          additionalProperties: false,
        },
        minItems: 3,
        maxItems: 6,
      },
    },
    required: ["title", "sections"],
    additionalProperties: false,
  },
} as const;

const argsSchema = z.object({
  title: z.string().min(1),
  sections: z
    .array(z.object({ heading: z.string().min(1), body: z.string().min(1) }))
    .min(1),
});

function toMarkdown(a: z.infer<typeof argsSchema>): string {
  return a.sections
    .map((s) => `### ${s.heading}\n\n${s.body}`)
    .join("\n\n");
}

export async function ensureDigest(
  jurisdiction: string,
  period: string,
): Promise<{ created: boolean; skipped?: string }> {
  const db = getDb();
  const [existing] = await db
    .select({ id: jurisdictionDigest.id })
    .from(jurisdictionDigest)
    .where(
      and(
        eq(jurisdictionDigest.jurisdiction, jurisdiction),
        eq(jurisdictionDigest.period, period),
      ),
    )
    .limit(1);
  if (existing) return { created: false };

  const env = serverEnv();
  if (!env.ANTHROPIC_API_KEY) return { created: false, skipped: "no-key" };

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  const message = await client.messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: 900,
    tools: [tool as unknown as Anthropic.Tool],
    tool_choice: { type: "tool", name: TOOL },
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              `Write the ${periodLabel(period)} inspection-prep digest for ` +
              `food-truck operators under "${jurisdiction}". Cover common ` +
              `health-inspection focus areas, a seasonal reminder, and a ` +
              `documentation checklist. General guidance only — explicitly ` +
              `not legal advice.`,
          },
        ],
      },
    ],
  });

  const toolUse = message.content.find(
    (b): b is Anthropic.ToolUseBlock =>
      b.type === "tool_use" && b.name === TOOL,
  );
  if (!toolUse) return { created: false, skipped: "no-output" };
  const parsed = argsSchema.safeParse(toolUse.input);
  if (!parsed.success) return { created: false, skipped: "bad-output" };

  await db.insert(jurisdictionDigest).values({
    jurisdiction,
    period,
    title: parsed.data.title,
    contentMarkdown: toMarkdown(parsed.data),
    generatedByModel: env.ANTHROPIC_MODEL,
    status: "published",
  });
  return { created: true };
}
