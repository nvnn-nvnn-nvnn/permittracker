# Code 04 — The OCR extraction pipeline (implementation)

Goal: read the *actual code* that turns an uploaded permit into validated,
structured fields — `lib/extraction/schema.ts`, `extract.ts`, `run.ts`. This
is the implementation behind Phase 3's reasoning note.

Prereq: code notes 01–02 (tRPC, transactions, Drizzle).

---

## 1. The shape (pattern: "force a form, then distrust it")

LLM → free text is unusable for a database. The pattern:

```
define a TOOL (a strict JSON schema)  →  force the model to call it
        →  re-validate its arguments with zod (assume it lied)
        →  defensively parse each value (assume it's still wrong)
        →  store as a SUGGESTION, never the real record
```

Three files, one job each:
- `schema.ts` — the tool definition + validation + parsers (no I/O).
- `extract.ts` — the Claude call + cost math (no DB).
- `run.ts` — orchestration: download → extract → persist (the DB writes).

Separation matters: each file is testable/readable alone, and the "talk to
the model" part has zero database knowledge.

---

## 2. `schema.ts` — the tool *is* the contract

File: [`lib/extraction/schema.ts`](../../lib/extraction/schema.ts).

```ts
const field = (desc: string) => ({
  type: "object" as const,
  properties: {
    value:      { type: ["string", "null"], description: desc },
    confidence: { type: "string", enum: ["low","medium","high"] },
  },
  required: ["value", "confidence"],
  additionalProperties: false,
});
```

- `field()` is a tiny factory so every extracted field has the **same
  shape**: a `value` (string or null) **plus the model's own
  `confidence`**. Asking for confidence per field is what later powers the
  "low confidence on expiry → manual review" rule.
- `additionalProperties: false` — the model may not invent extra keys.
- `type: ["string","null"]` — "null if not present" is encoded in the schema
  itself, not just the prose.

```ts
export const extractionTool = {
  name: "record_compliance_document",
  description: "Record the structured fields … Use null … Never guess.",
  input_schema: { type:"object", properties:{ document_type: field(…), … },
                  required:[…], additionalProperties:false },
} as const;
```

This object is a **JSON Schema**. It's both the instruction to Claude *and*
the contract we'll validate against. Defined once (a brief requirement);
nothing else describes these fields.

```ts
const fieldSchema = z.object({
  value: z.string().nullable(),
  confidence: z.enum(["low","medium","high"]),
});
export const extractionArgsSchema = z.object({ document_type: fieldSchema, … });
```

The **same shape again, in zod** — because the JSON Schema tells Claude what
to do, but zod is what *we* trust. Two representations of one contract: one
for the model, one for our runtime check.

```ts
export function parseIsoDate(v: string|null): Date|null {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}
```

Even after zod says "it's a string", we *still* don't trust the content.
`parseIsoDate` only accepts a real `YYYY-MM-DD`; "sometime in spring" →
`null`, not a garbage Date. `parseMoneyToCents` strips `$`/commas → integer
cents (never a float — same money rule as code note 02). `normalizeDocType`
maps the model's free guess ("Certificate of Insurance", "liability") onto
our strict enum, or `null` if it can't be sure. **The philosophy: the model
is a smart intern; verify, and degrade to "unknown" instead of guessing.**

---

## 3. `extract.ts` — call Claude, force the tool, recompute cost

File: [`lib/extraction/extract.ts`](../../lib/extraction/extract.ts).

```ts
const message = await client.messages.create({
  model,
  max_tokens: 1024,
  tools: [extractionTool as unknown as Anthropic.Tool],
  tool_choice: { type: "tool", name: EXTRACTION_TOOL_NAME },
  messages: [{ role: "user", content: [
    { type: "text", text: "Extract the compliance fields … Do not guess …" },
    ...contentBlock(params.bytesBase64, params.mimeType),
  ]}],
});
```

- **`tool_choice: { type: "tool", name … }`** — the linchpin. This *forces*
  Claude to answer by calling our tool. It cannot reply with a paragraph;
  it must produce arguments matching the schema.
- **`contentBlock(...)`** — PDFs become a `document` block, images an
  `image` block, both as base64 (recall code-note discussion: base64 lets
  binary ride inside the JSON request). Unsupported type → throw early.
- **`as unknown as Anthropic.Tool`** — our tool is a correct JSON-schema
  literal; the only type friction is `as const` readonly arrays vs the SDK's
  mutable type. The cast is annotated so a future reader knows it's
  deliberate, not lazy. (This is how you document a *necessary* `any`-ish
  cast — the brief allows it *with a justifying comment*.)

```ts
const toolUse = message.content.find(
  (b): b is Anthropic.ToolUseBlock =>
    b.type === "tool_use" && b.name === EXTRACTION_TOOL_NAME);
if (!toolUse) throw new ExtractionParseError("…did not return structured output.");

const parsed = extractionArgsSchema.safeParse(toolUse.input);
if (!parsed.success) throw new ExtractionParseError(`…failed validation: …`);
```

- `(b): b is Anthropic.ToolUseBlock` is a **type guard** — after `.find`,
  TypeScript knows `toolUse` is a tool-use block, not "some content block".
- Missing tool call → typed `ExtractionParseError`. Custom error classes
  (`ExtractionConfigError` for "no API key", `ExtractionParseError` for "bad
  output") let `run.ts`/UI react differently to "not configured" vs "model
  misbehaved".
- `safeParse` (not `parse`) → no throw; we branch explicitly. **Claude's raw
  output never reaches the DB unvalidated.**

```ts
const PRICING = { "claude-sonnet-4-6": { in:3, out:15 }, … };
function microUsd(model, inTok, outTok) {
  const p = PRICING[model] ?? { in:3, out:15 };
  return Math.round(inTok * p.in + outTok * p.out);
}
```

Cost is computed from `message.usage` token counts into **integer
micro-USD** (same "no floats for money" rule). Unknown model → conservative
fallback. This is the number the `/admin` dashboard sums.

---

## 4. `run.ts` — orchestration, the only file that writes

File: [`lib/extraction/run.ts`](../../lib/extraction/run.ts).

```ts
await withActor(actor, async (tx) => {
  await tx.update(fileAttachment)
    .set({ status:"extracting", updatedAt:new Date() })
    .where(eq(fileAttachment.id, fileId));
});
```

Mark the file `extracting` first (UI shows progress) — wrapped in
`withActor` so the audit trigger attributes it (code note 02 §4).

```ts
try {
  const { base64 } = await downloadBytes(file.storagePath);   // service role
  const result = await extractDocument({ bytesBase64: base64, … });
  const a = result.args;

  const needsManualReview =
    a.expiration_date.confidence === "low" || a.expiration_date.value === null;
  const overall = a.expiration_date.confidence;

  const proposalId = await withActor(actor, async (tx) => {
    const [proposal] = await tx.insert(extractionProposal).values({
      accountId: file.accountId, fileId: file.id, status: "pending",
      documentType: normalizeDocType(a.document_type.value),
      expirationDate: parseIsoDate(a.expiration_date.value),
      renewalFeeAmountCents: parseMoneyToCents(a.renewal_fee_amount.value),
      …, fieldConfidence,
    }).returning({ id: extractionProposal.id });

    await tx.insert(extractionCost).values({ … result … });

    await tx.update(fileAttachment).set({
      status:"extracted", ocrConfidence: overall, needsManualReview,
      extractionError: null, updatedAt:new Date(),
    }).where(eq(fileAttachment.id, file.id));

    if (!proposal) throw new Error("proposal insert failed");
    return proposal.id;
  });
  return { proposalId, needsManualReview };
} catch (err) {
  await withActor(actor, tx => tx.update(fileAttachment)
    .set({ status:"failed", extractionError: message }) … );
  throw err;
}
```

Read the structure, not the fields:

- **The proposal + cost + file-status flip are one `withActor` transaction.**
  Either you get a proposal *and* a cost row *and* `status:"extracted"`, or
  none of it. No "charged but no proposal" half-states.
- **`needsManualReview`** keys off the **expiration date** specifically — the
  one field that can shut a truck down. Low/again-null there → the UI banner.
- **It writes `extractionProposal`, never `complianceItem`.** This is the
  brief's "never claim renewed from OCR" rule made *structural*: the OCR code
  has no code path to the item. Applying is a separate user action
  (`file.applyProposal`, code note 01's pattern).
- **`catch` flips the file to `failed` with the message** (also audited) and
  re-throws. The UI's Retry button reads that state.

`actor = file.createdByUserId ?? ""` — extraction may run from the cron with
no logged-in user; empty actor → the trigger records NULL ("system"). The
audit still happens; we just honestly don't claim a person did it.

---

## 5. Build it yourself (exercise)

Add a `permit_class` field to the extraction:

1. In `schema.ts`: add `permit_class: field("…")` to the tool's
   `properties` **and** `required`, and `permit_class: fieldSchema` to
   `extractionArgsSchema`. (Two places — the model contract and our check.)
2. In `run.ts`: add `permitClass: a.permit_class.value` to the proposal
   insert and `permitClass: a.permit_class.confidence` to
   `fieldConfidence`. (You'd also add a column in `schema.ts` + migration —
   code note 02.)
3. `npm run typecheck` — note how the zod type flows so the new field is
   required everywhere or it won't compile.

---

## 6. Gotchas

- **Two schemas must agree.** The JSON-Schema tool and `extractionArgsSchema`
  describe the same fields twice. Add a field to one only → the model sends
  something zod rejects (or vice-versa). Always edit both.
- **`tool_choice` forced** is what makes output reliable. Drop it and Claude
  may "explain" instead of calling the tool → `ExtractionParseError`.
- **Never `parse` model output — `safeParse` and branch.** A throw deep in
  an LLM response is hard to attribute; an explicit typed error isn't.
- **All-or-nothing persistence:** keep proposal + cost + status in one `tx`.
  A cost row with no proposal would corrupt the admin numbers.
- **Cost is recomputed by us** from token usage, not taken from the model.
  Never trust the thing you're paying to self-report the bill.
