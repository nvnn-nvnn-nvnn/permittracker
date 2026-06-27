import { z } from "zod";
import { and, asc, desc, eq, gte, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, opsProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import {
  ingredient,
  inventoryCount,
  inventoryCountLine,
  inventoryUsage,
} from "@/lib/db/schema";
import { ingredientInput, inventoryCountInput } from "@/lib/validators";

/** Dollars → integer cents (null/undefined passes through as 0). */
function toCents(dollars: number | undefined): number {
  return dollars === undefined ? 0 : Math.round(dollars * 100);
}

/**
 * Inventory (ingredients) — Slice 2a. Account-scoped, archive-only,
 * operational (not audited). Writes go through the service connection.
 */
export const inventoryRouter = createTRPCRouter({
  list: opsProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select()
        .from(ingredient)
        .where(eq(ingredient.accountId, ctx.account.accountId))
        .orderBy(asc(ingredient.name));
      return input?.includeArchived
        ? rows
        : rows.filter((r) => r.archivedAt === null);
    }),

  byId: opsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select()
        .from(ingredient)
        .where(
          and(
            eq(ingredient.id, input.id),
            eq(ingredient.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  /** Counts + total inventory value (cents) + low-stock count. */
  summary: opsProcedure.query(async ({ ctx }) => {
    const [row] = await getDb()
      .select({
        count: sql<number>`count(*)::int`,
        // on_hand * unit_cost, summed; cast to bigint then int-safe via numeric.
        valueCents: sql<number>`coalesce(sum(round(${ingredient.onHandQty} * ${ingredient.unitCostCents}))::bigint, 0)`,
        lowStock: sql<number>`count(*) filter (where ${ingredient.parLevel} is not null and ${ingredient.onHandQty} <= ${ingredient.parLevel})::int`,
      })
      .from(ingredient)
      .where(
        and(
          eq(ingredient.accountId, ctx.account.accountId),
          isNull(ingredient.archivedAt),
        ),
      );
    return {
      count: Number(row?.count ?? 0),
      valueCents: Number(row?.valueCents ?? 0),
      lowStock: Number(row?.lowStock ?? 0),
    };
  }),

  /** Theoretical ingredient usage (auto-depletion) over the last `days`. */
  usage: opsProcedure
    .input(z.object({ days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const since = new Date();
      since.setUTCDate(since.getUTCDate() - input.days);
      const rows = await getDb()
        .select({
          ingredientId: inventoryUsage.ingredientId,
          name: ingredient.name,
          unit: ingredient.unit,
          qtyUsed: sql<number>`sum(${inventoryUsage.qtyUsed})`,
          costCents: sql<number>`sum(${inventoryUsage.costCents})::int`,
        })
        .from(inventoryUsage)
        .innerJoin(ingredient, eq(ingredient.id, inventoryUsage.ingredientId))
        .where(
          and(
            eq(inventoryUsage.accountId, ctx.account.accountId),
            gte(inventoryUsage.businessDate, since),
          ),
        )
        .groupBy(inventoryUsage.ingredientId, ingredient.name, ingredient.unit)
        .orderBy(desc(sql`sum(${inventoryUsage.costCents})`));
      const items = rows
        .map((r) => ({
          ingredientId: r.ingredientId,
          name: r.name,
          unit: r.unit,
          qtyUsed: Number(r.qtyUsed),
          costCents: Number(r.costCents),
        }))
        .filter((r) => r.qtyUsed > 0);
      return {
        days: input.days,
        items,
        totalCostCents: items.reduce((s, r) => s + r.costCents, 0),
      };
    }),

  create: opsProcedure
    .input(ingredientInput)
    .mutation(async ({ ctx, input }) => {
      const [row] = await getDb()
        .insert(ingredient)
        .values({
          accountId: ctx.account.accountId,
          name: input.name,
          category: input.category,
          unit: input.unit ?? "each",
          unitCostCents: toCents(input.unitCost),
          onHandQty: input.onHandQty ?? 0,
          parLevel: input.parLevel ?? null,
          reorderToQty: input.reorderToQty ?? null,
          supplierName: input.supplierName,
          notes: input.notes,
          createdByUserId: ctx.account.userId,
        })
        .returning();
      return row;
    }),

  update: opsProcedure
    .input(z.object({ id: z.string().uuid(), data: ingredientInput }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      const [row] = await getDb()
        .update(ingredient)
        .set({
          name: input.data.name,
          category: input.data.category,
          unit: input.data.unit ?? "each",
          unitCostCents: toCents(input.data.unitCost),
          onHandQty: input.data.onHandQty ?? 0,
          parLevel: input.data.parLevel ?? null,
          reorderToQty: input.data.reorderToQty ?? null,
          supplierName: input.data.supplierName,
          notes: input.data.notes,
          updatedAt: new Date(),
        })
        .where(eq(ingredient.id, input.id))
        .returning();
      return row;
    }),

  /** Quick on-hand adjustment (receive stock / count correction). */
  adjustStock: opsProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        // Either set an absolute on-hand, or apply a +/- delta.
        mode: z.enum(["set", "delta"]),
        qty: z.coerce.number(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      const newQty =
        input.mode === "set"
          ? sql`greatest(0, ${input.qty})`
          : sql`greatest(0, ${ingredient.onHandQty} + ${input.qty})`;
      const [row] = await getDb()
        .update(ingredient)
        .set({ onHandQty: newQty, updatedAt: new Date() })
        .where(eq(ingredient.id, input.id))
        .returning();
      return row;
    }),

  archive: opsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      const [row] = await getDb()
        .update(ingredient)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(ingredient.id, input.id))
        .returning();
      return row;
    }),

  // --- Inventory counts (snapshots) ---

  /** Recent counts, newest first. */
  listCounts: opsProcedure.query(async ({ ctx }) => {
    return getDb()
      .select()
      .from(inventoryCount)
      .where(eq(inventoryCount.accountId, ctx.account.accountId))
      .orderBy(desc(inventoryCount.countedOn), desc(inventoryCount.createdAt));
  }),

  /** A count with its per-ingredient lines. */
  countById: opsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select()
        .from(inventoryCount)
        .where(
          and(
            eq(inventoryCount.id, input.id),
            eq(inventoryCount.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      const lines = await getDb()
        .select({
          id: inventoryCountLine.id,
          ingredientId: inventoryCountLine.ingredientId,
          countedQty: inventoryCountLine.countedQty,
          unitCostCents: inventoryCountLine.unitCostCents,
          ingredientName: ingredient.name,
          unit: ingredient.unit,
        })
        .from(inventoryCountLine)
        .innerJoin(
          ingredient,
          eq(ingredient.id, inventoryCountLine.ingredientId),
        )
        .where(eq(inventoryCountLine.countId, row.id))
        .orderBy(asc(ingredient.name));
      return { ...row, lines };
    }),

  /**
   * Record a physical count: snapshots total value, stores per-ingredient
   * counted quantities, and reconciles ingredient on-hand to the counts.
   */
  createCount: opsProcedure
    .input(inventoryCountInput)
    .mutation(async ({ ctx, input }) => {
      // De-dupe lines by ingredient.
      const byId = new Map<string, number>();
      for (const l of input.lines) byId.set(l.ingredientId, l.countedQty);
      const ids = [...byId.keys()];

      // Validate ownership + snapshot current unit costs.
      const ings = ids.length
        ? await getDb()
            .select({
              id: ingredient.id,
              unitCostCents: ingredient.unitCostCents,
            })
            .from(ingredient)
            .where(
              and(
                eq(ingredient.accountId, ctx.account.accountId),
                inArray(ingredient.id, ids),
              ),
            )
        : [];
      if (ings.length !== ids.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "One or more ingredients are not in this account.",
        });
      }
      const costById = new Map(ings.map((i) => [i.id, i.unitCostCents]));
      const lines = ids.map((id) => ({
        ingredientId: id,
        countedQty: byId.get(id) ?? 0,
        unitCostCents: costById.get(id) ?? 0,
      }));
      const totalValueCents = lines.reduce(
        (s, l) => s + Math.round(l.countedQty * l.unitCostCents),
        0,
      );

      return getDb().transaction(async (tx) => {
        const [row] = await tx
          .insert(inventoryCount)
          .values({
            accountId: ctx.account.accountId,
            countedOn: input.countedOn,
            totalValueCents,
            note: input.note,
            createdByUserId: ctx.account.userId,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (lines.length > 0) {
          await tx.insert(inventoryCountLine).values(
            lines.map((l) => ({
              accountId: ctx.account.accountId,
              countId: row.id,
              ingredientId: l.ingredientId,
              countedQty: l.countedQty,
              unitCostCents: l.unitCostCents,
            })),
          );
          // Reconcile on-hand to the counted figures.
          for (const l of lines) {
            await tx
              .update(ingredient)
              .set({ onHandQty: l.countedQty, updatedAt: new Date() })
              .where(eq(ingredient.id, l.ingredientId));
          }
        }
        return row;
      });
    }),
});

/** Tenant guard — does this ingredient belong to my account? */
async function assertOwned(accountId: string, id: string): Promise<void> {
  const [owned] = await getDb()
    .select({ id: ingredient.id })
    .from(ingredient)
    .where(and(eq(ingredient.id, id), eq(ingredient.accountId, accountId)))
    .limit(1);
  if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
}
