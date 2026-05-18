# Phase 3 — Explained (teaching walkthrough)

File upload + Claude OCR. The "wow" phase: photograph a permit, the app reads
it and suggests the fields — **you confirm**, OCR never writes the item itself.

---

## The flow, end to end

```
Browser: pick a file
  → tRPC file.createUploadUrl  (creates a file row, returns a SIGNED upload URL)
  → browser PUTs bytes straight to Supabase Storage (private bucket)
  → tRPC file.confirmUploaded  (status=uploaded; emits "file/uploaded" event)
      → Inngest job  ──┐  (or)  "Run extraction now" button
                       ├──→ runExtractionForFile(fileId)
                       │       → download bytes (service role)
                       │       → Claude vision + structured tool
                       │       → write extraction_proposal + extraction_cost
                       │       → file.status = extracted (+ manual-review flag)
Browser: review the suggested fields
  → Apply  → writes the ComplianceItem (audited)   [explicit user action]
  → Reject → proposal marked rejected
```

Two ways the OCR runs (your earlier choice: "Inngest + manual fallback"):
- **Inngest job** — production path; if `npx inngest-cli dev` is running it
  picks up the `file/uploaded` event automatically.
- **"Run extraction now"** — a button that calls the *same* function
  synchronously, so a demo works even without the Inngest dev server.
Both call one function (`runExtractionForFile`) → identical behaviour.

---

## 1. Why signed URLs instead of uploading through our server

The browser uploads bytes **directly** to Supabase Storage using a one-time
**signed upload URL** we mint server-side.

- The bucket is **private** — no public URLs, ever. Downloads also use
  short-lived signed URLs (10 min).
- We never stream big files through tRPC/our server → faster, cheaper, no
  body-size limits.
- The DB row (`file_attachment`) is still created via tRPC first, so every
  file is tracked, account-scoped, and audited. Bytes and metadata are
  separated: metadata through the typed API, bytes straight to storage.

Storage security: we add **no** permissive `storage.objects` policies. With
RLS on and no policy, anon/authenticated keys are denied; only the
server-side service role (used to mint signed URLs) can touch objects. The
signed URL itself is the capability — smallest possible attack surface.

---

## 2. Structured output — making Claude return data, not prose

If you just ask an LLM "what's the expiration date?" you get a paragraph.
Useless for a database. So we use **tool use / structured output**
([lib/extraction/schema.ts](../lib/extraction/schema.ts)):

- We define one tool, `record_compliance_document`, with a strict JSON
  schema: every field is `{ value, confidence }`.
- We force Claude to call that tool (`tool_choice`), so the model *must*
  return data shaped exactly how we asked.
- We **still don't trust it** — Claude's tool arguments are re-validated with
  a matching zod schema before anything is stored. Dates/money are parsed
  defensively (`parseIsoDate`, `parseMoneyToCents`) because models can stray.

The tool is defined **once** (brief requirement) and reused everywhere.

---

## 3. Confidence + the manual-review rule

Claude reports its own confidence (`low | medium | high`) per field. The
brief calls out one specifically: if **expiration-date** confidence is `low`
(or it couldn't find one), we set `file.needs_manual_review = true` and the UI
shows a ⚠ banner. The expiration date is the field that can shut a truck
down — we'd rather flag uncertainty than silently trust a bad read.

---

## 4. The proposal is a SUGGESTION (a hard brief rule)

`extraction_proposal` is deliberately a *separate table*. The OCR pipeline
**never** touches the `ComplianceItem`. The user clicks **Apply**, and only
then — via tRPC, audited, attributed to them — do the suggested values land
on the item. We also never auto-set status to "renewed". This directly
implements two brief "never do" rules. Apply only fills fields the proposal
actually found (nulls are skipped, existing data preserved).

---

## 5. Cost tracking (required from Phase 3, surfaced in Admin)

Every Claude call writes an `extraction_cost` row: model, input/output
tokens, and cost in **micro-USD** (integer-exact, like we did money in
Phase 2). The role-gated `/admin` page sums these. This is *why* you should
use a separate Anthropic key for PermitKeep — shared keys make this number
meaningless.

---

## 6. Reusing the audit trigger

`file_attachment` was added to the `audit_entity` enum and gets the **same**
Phase 2 audit trigger (`permitkeep_audit('file_attachment')`). Uploading,
extracting, applying — all leave an immutable trail, for free, because the
trigger is generic. (Enum value added in migration `0004`, used by the
trigger in a *separate* migration `0005` — Postgres won't let you use a new
enum value in the same transaction it's created.)

---

## Files that matter

- `lib/extraction/schema.ts` — the Claude tool + validation/parsers.
- `lib/extraction/extract.ts` — the Claude call + token→cost math.
- `lib/extraction/run.ts` — the pipeline (download → extract → persist).
- `lib/storage.ts` — signed upload/read, service-role client.
- `lib/trpc/routers/file.ts` — upload URL, confirm, run-now, apply/reject.
- `inngest/` + `app/api/inngest/route.ts` — the background job + endpoint.
- `components/features/documents-panel.tsx` — upload UI + proposal review.
- `app/(app)/admin/page.tsx` — cost dashboard.
- `supabase/migrations/0004*`, `0005*` — schema + bucket/trigger/RLS.

---

## How to demo Phase 3

1. (Optional, for the async path) in a 2nd terminal:
   `npx inngest-cli@latest dev` — it auto-finds `/api/inngest`.
2. Open a compliance item → **Documents → Upload document** (a permit PDF or
   a clear photo).
3. If Inngest dev is running, extraction happens automatically; otherwise
   click **Run extraction now**.
4. Review the **suggested fields** with confidence chips. Low expiration-date
   confidence → the ⚠ manual-review banner appears.
5. Click **Apply to item** → the item's fields fill in (and an audit row is
   written). Or **Reject**.
6. As a platform admin, open **/admin** → see the extraction cost tally.

---

## Post-sign-off enhancements (2026-05-16, owner-requested)

Phase 3 was signed off, then the owner requested four UX refinements. No
schema or stack changes — all additive.

### A. Reject → Retry extraction
A rejected proposal used to be a dead end (file stays `extracted`, so the
"Run extraction now" button never reappeared). Now a rejected proposal shows
a **Retry extraction** button that re-runs the *same* `runExtractionNow`
path → a fresh `pending` proposal. Each retry still writes an
`extraction_cost` row (re-running isn't free — the admin tally stays honest).
File: `components/features/documents-panel.tsx`.

### B. Reminder schedule rework (`components/features/item-form.tsx`)
Replaced the raw comma-separated text input with:
- **Preset chips** — one-tap toggles: 90 / 60 / 30 / 14 / 7 / 3 / 1 days
  before, and "Day of". Per-type sensible defaults are pre-selected and
  refresh when the item type changes on a *new* item (unless the user has
  already customised — tracked via `remindersTouched`).
- **Custom add** — number field + Add (or Enter); custom values show as
  removable chips.
- **Use-case flag** — a 🔔 help callout explaining these are the advance
  email/SMS warnings before expiry (and other deadlines like a fee due).
- **Soft "catch" (not an error)** — if the custom box has an unadded value,
  or zero reminders are selected, the first save **does not submit**; an
  amber notice appears and the button relabels to "Add/Save anyway".
  Clicking again proceeds deliberately. Nothing is thrown or lost — it just
  prevents accidental empty/half-filled submissions. Reminder values now come
  from React state, not `FormData`. The Type `<select>` became controlled
  (`value={type}`) so it stays in sync with the defaults logic.

### C. Inline document preview
Added a declarative `file.viewUrl` **query** (account-scoped + ownership-
checked, 10-min signed URL, cached ~9 min < expiry) so previews load without
re-minting URLs. `documents-panel.tsx` now renders **images inline** as
thumbnails, **PDFs in an embedded frame**, with a Hide/Preview toggle
(previews on by default). Plain `<img>` is used intentionally for the
short-lived signed URL (next/image can't optimize it) — documented inline.

### D. UI spacing pass
- App shell (`components/features/app-shell.tsx`): main content is now a
  centered `max-w-5xl` container with roomier padding
  (`px-4 py-6 md:px-10 md:py-10`); sidebar rhythm loosened (gap-8, p-5,
  nav `py-2.5`, gap-1.5; larger brand).
- All nine authenticated pages: top wrapper `space-y-6` → `space-y-8`.
- Forms: item-form `gap-6` outer / `gap-5` grid; truck-form `gap-5`.

Verification: typecheck ✅ · lint ✅ (production `build` intentionally NOT
run here — it would corrupt the running dev server's shared `.next`; lesson
from Phase 3 startup. One clean `build` is done at phase boundaries.)
