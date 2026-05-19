import "server-only";
import { randomUUID } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { withActor } from "@/lib/db";
import {
  complianceItem,
  extractionProposal,
  fileAttachment,
} from "@/lib/db/schema";
import { buildStoragePath, uploadBytes } from "@/lib/storage";
import { classifyInboundEmail } from "./classify";

export interface InboundAttachment {
  filename: string;
  contentType: string;
  base64: string;
}
export interface InboundEmail {
  from: string;
  subject: string;
  body: string;
  attachments: InboundAttachment[];
}
export interface InboundResult {
  category: string;
  matched: boolean;
  itemId: string;
  fileIds: string[];
  proposalId: string | null;
}

/**
 * Core inbound-email handler — shared by the Postmark webhook and the dev
 * simulator. Stores attachments as files, classifies with Claude, matches to
 * an existing item or creates a DRAFT (status 'pending'), and—when it looks
 * like a renewal—files an extraction PROPOSAL the user must confirm. We never
 * auto-apply changes to a ComplianceItem (brief).
 */
export async function processInboundEmail(
  accountId: string,
  email: InboundEmail,
): Promise<InboundResult> {
  const cls = await classifyInboundEmail({
    subject: email.subject,
    body: email.body,
  });

  return withActor("", async (tx) => {
    // --- Match an existing, non-archived item ---
    let matchedId: string | null = null;
    if (cls.identifier) {
      const [m] = await tx
        .select({ id: complianceItem.id })
        .from(complianceItem)
        .where(
          and(
            eq(complianceItem.accountId, accountId),
            isNull(complianceItem.archivedAt),
            eq(complianceItem.identifier, cls.identifier),
          ),
        )
        .limit(1);
      matchedId = m?.id ?? null;
    }
    if (!matchedId && cls.jurisdiction && cls.documentType) {
      const [m] = await tx
        .select({ id: complianceItem.id })
        .from(complianceItem)
        .where(
          and(
            eq(complianceItem.accountId, accountId),
            isNull(complianceItem.archivedAt),
            eq(complianceItem.jurisdiction, cls.jurisdiction),
            eq(complianceItem.itemType, cls.documentType),
          ),
        )
        .limit(1);
      matchedId = m?.id ?? null;
    }

    // --- Target item: matched, or a new DRAFT for review ---
    let itemId = matchedId;
    if (!itemId) {
      const [draft] = await tx
        .insert(complianceItem)
        .values({
          accountId,
          itemType: cls.documentType ?? "permit",
          status: "pending",
          jurisdiction: cls.jurisdiction,
          identifier: cls.identifier,
          expirationDate: cls.expirationDate,
          holderName: cls.holderName,
          notes: `Created from forwarded email: ${email.subject}`.slice(
            0,
            2000,
          ),
        })
        .returning({ id: complianceItem.id });
      itemId = draft?.id ?? null;
    }
    if (!itemId) throw new Error("Failed to resolve inbound target item");

    // --- Store attachments as files on the target item ---
    const fileIds: string[] = [];
    for (const att of email.attachments) {
      const fileId = randomUUID();
      const path = buildStoragePath({
        accountId,
        complianceItemId: itemId,
        fileId,
        originalFilename: att.filename,
      });
      const bytes = Buffer.from(att.base64, "base64");
      await uploadBytes(path, bytes, att.contentType);
      await tx.insert(fileAttachment).values({
        id: fileId,
        accountId,
        complianceItemId: itemId,
        storagePath: path,
        originalFilename: att.filename,
        mimeType: att.contentType,
        sizeBytes: bytes.byteLength,
        status: "uploaded",
      });
      fileIds.push(fileId);
    }

    // --- Renewal notice → file a PROPOSAL (needs a file row) for review ---
    let proposalId: string | null = null;
    if (
      cls.category === "renewal_notice" &&
      fileIds[0] &&
      (cls.expirationDate || cls.identifier || cls.jurisdiction)
    ) {
      const [p] = await tx
        .insert(extractionProposal)
        .values({
          accountId,
          fileId: fileIds[0],
          status: "pending",
          documentType: cls.documentType,
          jurisdiction: cls.jurisdiction,
          identifierNumber: cls.identifier,
          expirationDate: cls.expirationDate,
          holderName: cls.holderName,
          fieldConfidence: {
            expirationDate: cls.confidence,
            jurisdiction: cls.confidence,
            identifierNumber: cls.confidence,
          },
        })
        .returning({ id: extractionProposal.id });
      proposalId = p?.id ?? null;
    }

    return {
      category: cls.category,
      matched: matchedId !== null,
      itemId,
      fileIds,
      proposalId,
    };
  });
}
