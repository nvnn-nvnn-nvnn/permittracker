import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, protectedProcedure } from "@/lib/trpc/trpc";
import { getDb, withActor } from "@/lib/db";
import {
  complianceItem,
  extractionProposal,
  fileAttachment,
} from "@/lib/db/schema";
import {
  buildStoragePath,
  createSignedReadUrl,
  createSignedUploadUrl,
} from "@/lib/storage";
import { runExtractionForFile } from "@/lib/extraction/run";
import { recomputeDispatches } from "@/lib/reminders/schedule";
import { inngest } from "@/inngest/client";

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

export const fileRouter = createTRPCRouter({
  listForItem: protectedProcedure
    .input(z.object({ complianceItemId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      return db
        .select()
        .from(fileAttachment)
        .where(
          and(
            eq(fileAttachment.accountId, ctx.account.accountId),
            eq(fileAttachment.complianceItemId, input.complianceItemId),
          ),
        )
        .orderBy(desc(fileAttachment.createdAt));
    }),

  /** Issue a one-time signed upload URL; create the file row (uploading). */
  createUploadUrl: protectedProcedure
    .input(
      z.object({
        complianceItemId: z.string().uuid().nullable(),
        originalFilename: z.string().min(1).max(200),
        mimeType: z.string(),
        sizeBytes: z.number().int().positive().max(25_000_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!ALLOWED_MIME.has(input.mimeType)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only PDF, JPEG, PNG, GIF, or WEBP are supported.",
        });
      }
      // If attaching to an item, that item must be in this account.
      if (input.complianceItemId) {
        const db = getDb();
        const [it] = await db
          .select({ id: complianceItem.id })
          .from(complianceItem)
          .where(
            and(
              eq(complianceItem.id, input.complianceItemId),
              eq(complianceItem.accountId, ctx.account.accountId),
            ),
          )
          .limit(1);
        if (!it) throw new TRPCError({ code: "NOT_FOUND" });
      }

      const fileId = crypto.randomUUID();
      const storagePath = buildStoragePath({
        accountId: ctx.account.accountId,
        complianceItemId: input.complianceItemId,
        fileId,
        originalFilename: input.originalFilename,
      });

      const signed = await createSignedUploadUrl(storagePath);

      await withActor(ctx.account.userId, async (tx) => {
        await tx.insert(fileAttachment).values({
          id: fileId,
          accountId: ctx.account.accountId,
          complianceItemId: input.complianceItemId,
          storagePath,
          originalFilename: input.originalFilename,
          mimeType: input.mimeType,
          sizeBytes: input.sizeBytes,
          status: "uploading",
          createdByUserId: ctx.account.userId,
        });
      });

      return {
        fileId,
        path: storagePath,
        token: signed.token,
        signedUrl: signed.signedUrl,
      };
    }),

  /** Mark bytes present and enqueue the OCR job (best-effort). */
  confirmUploaded: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedFile(ctx.account.accountId, input.fileId);
      await withActor(ctx.account.userId, async (tx) => {
        await tx
          .update(fileAttachment)
          .set({ status: "uploaded", updatedAt: new Date() })
          .where(eq(fileAttachment.id, input.fileId));
      });
      // Best-effort: if the Inngest dev server isn't running this no-ops;
      // the user can still trigger extraction manually.
      try {
        await inngest.send({
          name: "file/uploaded",
          data: { fileId: input.fileId },
        });
      } catch {
        /* manual fallback exists */
      }
      return { ok: true };
    }),

  /** Manual fallback: run OCR synchronously (no Inngest dev server needed). */
  runExtractionNow: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwnedFile(ctx.account.accountId, input.fileId);
      return runExtractionForFile(input.fileId);
    }),

  /** Latest proposal for a file (account-scoped). */
  latestProposal: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const db = getDb();
      const [p] = await db
        .select()
        .from(extractionProposal)
        .where(
          and(
            eq(extractionProposal.accountId, ctx.account.accountId),
            eq(extractionProposal.fileId, input.fileId),
          ),
        )
        .orderBy(desc(extractionProposal.createdAt))
        .limit(1);
      return p ?? null;
    }),

  signedReadUrl: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const file = await assertOwnedFile(
        ctx.account.accountId,
        input.fileId,
      );
      return { url: await createSignedReadUrl(file.storagePath) };
    }),

  /** Declarative variant for inline previews (cacheable, account-scoped). */
  viewUrl: protectedProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const file = await assertOwnedFile(
        ctx.account.accountId,
        input.fileId,
      );
      return {
        url: await createSignedReadUrl(file.storagePath, 600),
        mimeType: file.mimeType,
      };
    }),

  /**
   * Apply a proposal to its file's ComplianceItem. EXPLICIT user action —
   * OCR never writes the item itself. Only non-null suggested fields are
   * written; status is NOT auto-set to "renewed" (brief).
   */
  applyProposal: protectedProcedure
    .input(z.object({ proposalId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [proposal] = await db
        .select()
        .from(extractionProposal)
        .where(
          and(
            eq(extractionProposal.id, input.proposalId),
            eq(extractionProposal.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND" });

      const [file] = await db
        .select()
        .from(fileAttachment)
        .where(eq(fileAttachment.id, proposal.fileId))
        .limit(1);
      if (!file?.complianceItemId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message:
            "Attach this document to a compliance item before applying.",
        });
      }
      const itemId = file.complianceItemId;

      return withActor(ctx.account.userId, async (tx) => {
        // Only set fields the proposal actually found.
        const set: Record<string, unknown> = { updatedAt: new Date() };
        if (proposal.documentType) set.itemType = proposal.documentType;
        if (proposal.subtype) set.subtype = proposal.subtype;
        if (proposal.jurisdiction) set.jurisdiction = proposal.jurisdiction;
        if (proposal.identifierNumber)
          set.identifier = proposal.identifierNumber;
        if (proposal.issueDate) set.issueDate = proposal.issueDate;
        if (proposal.expirationDate)
          set.expirationDate = proposal.expirationDate;
        if (proposal.renewalFeeAmountCents != null)
          set.feeAmountCents = proposal.renewalFeeAmountCents;
        if (proposal.feeDueDate) set.feeDueDate = proposal.feeDueDate;
        if (proposal.holderName) set.holderName = proposal.holderName;

        const [updatedItem] = await tx
          .update(complianceItem)
          .set(set)
          .where(
            and(
              eq(complianceItem.id, itemId),
              eq(complianceItem.accountId, ctx.account.accountId),
            ),
          )
          .returning();
        // Applying OCR can change expiry/fee → recompute reminders.
        if (updatedItem) await recomputeDispatches(tx, updatedItem);

        await tx
          .update(extractionProposal)
          .set({
            status: "applied",
            appliedAt: new Date(),
            appliedByUserId: ctx.account.userId,
            updatedAt: new Date(),
          })
          .where(eq(extractionProposal.id, proposal.id));

        return { ok: true, itemId };
      });
    }),

  rejectProposal: protectedProcedure
    .input(z.object({ proposalId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [p] = await db
        .select({ id: extractionProposal.id })
        .from(extractionProposal)
        .where(
          and(
            eq(extractionProposal.id, input.proposalId),
            eq(extractionProposal.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!p) throw new TRPCError({ code: "NOT_FOUND" });
      await withActor(ctx.account.userId, async (tx) => {
        await tx
          .update(extractionProposal)
          .set({ status: "rejected", updatedAt: new Date() })
          .where(eq(extractionProposal.id, input.proposalId));
      });
      return { ok: true };
    }),
});

/** Ownership guard — returns the row or throws NOT_FOUND. */
async function assertOwnedFile(accountId: string, fileId: string) {
  const db = getDb();
  const [file] = await db
    .select()
    .from(fileAttachment)
    .where(
      and(
        eq(fileAttachment.id, fileId),
        eq(fileAttachment.accountId, accountId),
      ),
    )
    .limit(1);
  if (!file) throw new TRPCError({ code: "NOT_FOUND" });
  return file;
}
