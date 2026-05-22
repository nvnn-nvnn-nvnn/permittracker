import { z } from "zod";
import { and, desc, eq, ilike, isNull, isNotNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, adminProcedure } from "@/lib/trpc/trpc";
import { getDb, withActor } from "@/lib/db";
import {
  account,
  complianceItem,
  extractionCost,
  extractionProposal,
  fileAttachment,
  jurisdictionDigest,
  reminderDispatch,
} from "@/lib/db/schema";
import { recomputeDispatches } from "@/lib/reminders/schedule";
import { runMonthlyDigests } from "@/lib/digest/run";

/**
 * Platform-admin only (adminProcedure enforces is_platform_admin).
 *
 * CROSS-TENANT by design: this is the platform operator's ops cockpit, gated
 * by the admin ROLE, never by tenant membership. Reads use the service-role
 * db (RLS bypassed) — safe only because adminProcedure blocks non-admins.
 * Every resolve action runs through withActor(<admin user>) so the audit
 * trail attributes platform interventions to the operator.
 */
const INBOUND_DRAFT_MARK = "Created from forwarded email:%";

export const adminRouter = createTRPCRouter({
  // --- Phase 3 cost dashboard (kept) ---
  extractionCostSummary: adminProcedure.query(async () => {
    const db = getDb();
    const [totals] = await db
      .select({
        calls: sql<number>`count(*)::int`,
        inputTokens: sql<number>`coalesce(sum(${extractionCost.inputTokens}),0)::int`,
        outputTokens: sql<number>`coalesce(sum(${extractionCost.outputTokens}),0)::int`,
        costMicroUsd: sql<number>`coalesce(sum(${extractionCost.costMicroUsd}),0)::bigint`,
      })
      .from(extractionCost);
    const recent = await db
      .select()
      .from(extractionCost)
      .orderBy(desc(extractionCost.createdAt))
      .limit(20);
    return {
      totals: totals ?? {
        calls: 0,
        inputTokens: 0,
        outputTokens: 0,
        costMicroUsd: 0,
      },
      recent,
    };
  }),

  // --- Platform overview: accuracy + dispatch monitor + counts ---
  overview: adminProcedure.query(async () => {
    const db = getDb();

    const [proposalStats] = await db
      .select({
        applied: sql<number>`count(*) filter (where ${extractionProposal.status} = 'applied')::int`,
        rejected: sql<number>`count(*) filter (where ${extractionProposal.status} = 'rejected')::int`,
        pending: sql<number>`count(*) filter (where ${extractionProposal.status} = 'pending')::int`,
      })
      .from(extractionProposal);

    const dispatch = await db
      .select({
        status: reminderDispatch.status,
        n: sql<number>`count(*)::int`,
      })
      .from(reminderDispatch)
      .groupBy(reminderDispatch.status);

    const recentFailed = await db
      .select({
        id: reminderDispatch.id,
        channel: reminderDispatch.channel,
        error: reminderDispatch.error,
        sentAt: reminderDispatch.sentAt,
      })
      .from(reminderDispatch)
      .where(eq(reminderDispatch.status, "failed"))
      .orderBy(desc(reminderDispatch.sentAt))
      .limit(10);

    const [acctCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(account);
    const [itemCount] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(complianceItem)
      .where(isNull(complianceItem.archivedAt));
    const counts = {
      accounts: acctCount?.n ?? 0,
      items: itemCount?.n ?? 0,
    };

    const applied = proposalStats?.applied ?? 0;
    const rejected = proposalStats?.rejected ?? 0;
    const decided = applied + rejected;
    return {
      accuracy: {
        applied,
        rejected,
        pending: proposalStats?.pending ?? 0,
        // Proxy: share of human-decided proposals that were accepted.
        acceptRatePct:
          decided === 0 ? null : Math.round((applied / decided) * 100),
      },
      dispatch: Object.fromEntries(
        dispatch.map((d) => [d.status, d.n]),
      ) as Record<string, number>,
      recentFailed,
      counts: counts ?? { accounts: 0, items: 0 },
    };
  }),

  // --- Unified concierge verification queue (cross-tenant) ---
  conciergeQueue: adminProcedure.query(async () => {
    const db = getDb();

    const manualReviewFiles = await db
      .select({
        fileId: fileAttachment.id,
        filename: fileAttachment.originalFilename,
        accountName: account.name,
        itemId: fileAttachment.complianceItemId,
        createdAt: fileAttachment.createdAt,
      })
      .from(fileAttachment)
      .innerJoin(account, eq(account.id, fileAttachment.accountId))
      .where(
        and(
          eq(fileAttachment.needsManualReview, true),
          isNull(fileAttachment.archivedAt),
        ),
      )
      .orderBy(desc(fileAttachment.createdAt))
      .limit(50);

    const inboundDrafts = await db
      .select({
        itemId: complianceItem.id,
        itemType: complianceItem.itemType,
        identifier: complianceItem.identifier,
        accountName: account.name,
        createdAt: complianceItem.createdAt,
      })
      .from(complianceItem)
      .innerJoin(account, eq(account.id, complianceItem.accountId))
      .where(
        and(
          eq(complianceItem.status, "pending"),
          isNull(complianceItem.archivedAt),
          ilike(complianceItem.notes, INBOUND_DRAFT_MARK),
        ),
      )
      .orderBy(desc(complianceItem.createdAt))
      .limit(50);

    const conciergeAccounts = await db
      .select({
        accountId: account.id,
        name: account.name,
        purchasedAt: account.conciergePurchasedAt,
      })
      .from(account)
      .where(
        and(
          isNotNull(account.conciergePurchasedAt),
          isNull(account.conciergeCompletedAt),
        ),
      )
      .orderBy(desc(account.conciergePurchasedAt))
      .limit(50);

    return { manualReviewFiles, inboundDrafts, conciergeAccounts };
  }),

  // --- Resolve actions (audited as the admin) ---
  markFileReviewed: adminProcedure
    .input(z.object({ fileId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await withActor(ctx.account.userId, async (tx) => {
        await tx
          .update(fileAttachment)
          .set({ needsManualReview: false, updatedAt: new Date() })
          .where(eq(fileAttachment.id, input.fileId));
      });
      return { ok: true };
    }),

  resolveProposal: adminProcedure
    .input(
      z.object({
        proposalId: z.string().uuid(),
        action: z.enum(["apply", "reject"]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      const [proposal] = await db
        .select()
        .from(extractionProposal)
        .where(eq(extractionProposal.id, input.proposalId))
        .limit(1);
      if (!proposal) throw new TRPCError({ code: "NOT_FOUND" });

      if (input.action === "reject") {
        await withActor(ctx.account.userId, async (tx) => {
          await tx
            .update(extractionProposal)
            .set({ status: "rejected", updatedAt: new Date() })
            .where(eq(extractionProposal.id, proposal.id));
        });
        return { ok: true, applied: false };
      }

      // apply → resolve the proposal's file → its compliance item
      const [file] = await db
        .select({ itemId: fileAttachment.complianceItemId })
        .from(fileAttachment)
        .where(eq(fileAttachment.id, proposal.fileId))
        .limit(1);
      if (!file?.itemId) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Proposal's file is not attached to an item",
        });
      }
      const itemId = file.itemId;

      await withActor(ctx.account.userId, async (tx) => {
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
        if (proposal.permitClass) set.permitClass = proposal.permitClass;

        const [updated] = await tx
          .update(complianceItem)
          .set(set)
          .where(eq(complianceItem.id, itemId))
          .returning();
        if (updated) await recomputeDispatches(tx, updated);

        await tx
          .update(extractionProposal)
          .set({
            status: "applied",
            appliedAt: new Date(),
            appliedByUserId: ctx.account.userId,
            updatedAt: new Date(),
          })
          .where(eq(extractionProposal.id, proposal.id));
      });
      return { ok: true, applied: true };
    }),

  dismissDraft: adminProcedure
    .input(z.object({ itemId: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await withActor(ctx.account.userId, async (tx) => {
        await tx
          .update(complianceItem)
          .set({ archivedAt: new Date(), updatedAt: new Date() })
          .where(eq(complianceItem.id, input.itemId));
      });
      return { ok: true };
    }),

  markConciergeComplete: adminProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(async ({ input }) => {
      const db = getDb();
      await db
        .update(account)
        .set({ conciergeCompletedAt: new Date(), updatedAt: new Date() })
        .where(eq(account.id, input.accountId));
      return { ok: true };
    }),

  // --- Phase 10: inspection-prep digest ops ---
  digestList: adminProcedure.query(async () => {
    const db = getDb();
    return db
      .select()
      .from(jurisdictionDigest)
      .orderBy(desc(jurisdictionDigest.period))
      .limit(50);
  }),

  generateAndSendDigests: adminProcedure.mutation(async () => {
    return runMonthlyDigests();
  }),

  editDigest: adminProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        title: z.string().trim().min(1).max(200),
        contentMarkdown: z.string().trim().min(1).max(20_000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = getDb();
      await db
        .update(jurisdictionDigest)
        .set({
          title: input.title,
          contentMarkdown: input.contentMarkdown,
          status: "published",
          editedByUserId: ctx.account.userId,
          updatedAt: new Date(),
        })
        .where(eq(jurisdictionDigest.id, input.id));
      return { ok: true };
    }),
});
