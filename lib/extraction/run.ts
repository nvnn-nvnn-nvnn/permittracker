import "server-only";
import { eq } from "drizzle-orm";
import { getDb, withActor } from "@/lib/db";
import {
  extractionCost,
  extractionProposal,
  fileAttachment,
} from "@/lib/db/schema";
import { downloadBytes } from "@/lib/storage";
import { extractDocument } from "./extract";
import {
  normalizeDocType,
  parseIsoDate,
  parseMoneyToCents,
  type Confidence,
} from "./schema";

/**
 * The full OCR pipeline for one file. Idempotent-ish: safe to re-run; it
 * just produces another proposal. Called by the Inngest job AND the manual
 * "run now" fallback so behaviour is identical either way.
 *
 * We NEVER write to the ComplianceItem here — only a proposal. Applying is a
 * separate, explicit user action (brief: never claim "renewed" from OCR).
 */
export async function runExtractionForFile(fileId: string): Promise<{
  proposalId: string;
  needsManualReview: boolean;
}> {
  const db = getDb();
  const [file] = await db
    .select()
    .from(fileAttachment)
    .where(eq(fileAttachment.id, fileId))
    .limit(1);
  if (!file) throw new Error(`file_attachment ${fileId} not found`);

  const actor = file.createdByUserId ?? "";

  await withActor(actor, async (tx) => {
    await tx
      .update(fileAttachment)
      .set({ status: "extracting", updatedAt: new Date() })
      .where(eq(fileAttachment.id, fileId));
  });

  try {
    const { base64, contentType } = await downloadBytes(file.storagePath);
    const result = await extractDocument({
      bytesBase64: base64,
      mimeType: file.mimeType || contentType,
    });
    const a = result.args;

    const fieldConfidence: Record<string, Confidence> = {
      documentType: a.document_type.confidence,
      subtype: a.subtype.confidence,
      jurisdiction: a.jurisdiction.confidence,
      identifierNumber: a.identifier_number.confidence,
      issueDate: a.issue_date.confidence,
      expirationDate: a.expiration_date.confidence,
      renewalFeeAmount: a.renewal_fee_amount.confidence,
      feeDueDate: a.fee_due_date_if_shown.confidence,
      holderName: a.holder_name.confidence,
      permitClass: a.permit_class.confidence,
    };

    // Brief: low confidence on expiration date → flag manual review.
    const needsManualReview =
      a.expiration_date.confidence === "low" ||
      a.expiration_date.value === null;

    // Overall confidence = the expiration date's (the field that matters).
    const overall = a.expiration_date.confidence;

    const proposalId = await withActor(actor, async (tx) => {
      const [proposal] = await tx
        .insert(extractionProposal)
        .values({
          accountId: file.accountId,
          fileId: file.id,
          status: "pending",
          documentType: normalizeDocType(a.document_type.value),
          subtype: a.subtype.value,
          jurisdiction: a.jurisdiction.value,
          identifierNumber: a.identifier_number.value,
          issueDate: parseIsoDate(a.issue_date.value),
          expirationDate: parseIsoDate(a.expiration_date.value),
          renewalFeeAmountCents: parseMoneyToCents(
            a.renewal_fee_amount.value,
          ),
          feeDueDate: parseIsoDate(a.fee_due_date_if_shown.value),
          holderName: a.holder_name.value,
          permitClass: a.permit_class.value,
          fieldConfidence,
        })
        .returning({ id: extractionProposal.id });

      await tx.insert(extractionCost).values({
        accountId: file.accountId,
        fileId: file.id,
        model: result.model,
        inputTokens: result.inputTokens,
        outputTokens: result.outputTokens,
        costMicroUsd: result.costMicroUsd,
      });

      await tx
        .update(fileAttachment)
        .set({
          status: "extracted",
          ocrConfidence: overall,
          needsManualReview,
          extractionError: null,
          updatedAt: new Date(),
        })
        .where(eq(fileAttachment.id, file.id));

      if (!proposal) throw new Error("proposal insert failed");
      return proposal.id;
    });

    return { proposalId, needsManualReview };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Extraction failed";
    await withActor(actor, async (tx) => {
      await tx
        .update(fileAttachment)
        .set({
          status: "failed",
          extractionError: message,
          updatedAt: new Date(),
        })
        .where(eq(fileAttachment.id, fileId));
    });
    throw err;
  }
}
