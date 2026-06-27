import { z } from "zod";
import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { createTRPCRouter, opsProcedure } from "@/lib/trpc/trpc";
import { getDb } from "@/lib/db";
import { ingredient, recipe, recipeIngredient } from "@/lib/db/schema";
import { recipeInput } from "@/lib/validators";

function toCents(dollars: number | undefined): number {
  return dollars === undefined ? 0 : Math.round(dollars * 100);
}

/** De-dupe lines by ingredientId (unique constraint) and drop zero-qty rows. */
function normalizeLines(lines: { ingredientId: string; qty: number }[]) {
  const byId = new Map<string, number>();
  for (const l of lines ?? []) {
    if (l.qty > 0) byId.set(l.ingredientId, l.qty);
  }
  return [...byId.entries()].map(([ingredientId, qty]) => ({
    ingredientId,
    qty,
  }));
}

/** Validate every line's ingredient belongs to this account. */
async function assertIngredientsOwned(
  accountId: string,
  ingredientIds: string[],
) {
  if (ingredientIds.length === 0) return;
  const rows = await getDb()
    .select({ id: ingredient.id })
    .from(ingredient)
    .where(
      and(
        eq(ingredient.accountId, accountId),
        inArray(ingredient.id, ingredientIds),
      ),
    );
  if (rows.length !== ingredientIds.length) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "One or more ingredients are not in this account.",
    });
  }
}

export const recipeRouter = createTRPCRouter({
  /** Recipes with computed COGS (cents) + line count. */
  list: opsProcedure
    .input(z.object({ includeArchived: z.boolean().default(false) }).optional())
    .query(async ({ ctx, input }) => {
      const rows = await getDb()
        .select({
          id: recipe.id,
          name: recipe.name,
          category: recipe.category,
          sellPriceCents: recipe.sellPriceCents,
          archivedAt: recipe.archivedAt,
          cogsCents: sql<number>`coalesce(round(sum(${recipeIngredient.qty} * ${ingredient.unitCostCents}))::int, 0)`,
          lineCount: sql<number>`count(${recipeIngredient.id})::int`,
        })
        .from(recipe)
        .leftJoin(
          recipeIngredient,
          eq(recipeIngredient.recipeId, recipe.id),
        )
        .leftJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
        .where(eq(recipe.accountId, ctx.account.accountId))
        .groupBy(recipe.id)
        .orderBy(asc(recipe.name));

      const mapped = rows.map((r) => ({
        ...r,
        cogsCents: Number(r.cogsCents),
        lineCount: Number(r.lineCount),
      }));
      return input?.includeArchived
        ? mapped
        : mapped.filter((r) => r.archivedAt === null);
    }),

  /** A recipe with its ingredient lines (priced) + COGS. */
  byId: opsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const [row] = await getDb()
        .select()
        .from(recipe)
        .where(
          and(
            eq(recipe.id, input.id),
            eq(recipe.accountId, ctx.account.accountId),
          ),
        )
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });

      const lines = await getDb()
        .select({
          id: recipeIngredient.id,
          ingredientId: recipeIngredient.ingredientId,
          qty: recipeIngredient.qty,
          ingredientName: ingredient.name,
          unit: ingredient.unit,
          unitCostCents: ingredient.unitCostCents,
        })
        .from(recipeIngredient)
        .innerJoin(
          ingredient,
          eq(ingredient.id, recipeIngredient.ingredientId),
        )
        .where(eq(recipeIngredient.recipeId, row.id))
        .orderBy(asc(ingredient.name));

      const priced = lines.map((l) => ({
        ...l,
        lineCogsCents: Math.round(l.qty * l.unitCostCents),
      }));
      const cogsCents = priced.reduce((s, l) => s + l.lineCogsCents, 0);
      return { ...row, lines: priced, cogsCents };
    }),

  create: opsProcedure
    .input(recipeInput)
    .mutation(async ({ ctx, input }) => {
      const lines = normalizeLines(input.lines);
      await assertIngredientsOwned(
        ctx.account.accountId,
        lines.map((l) => l.ingredientId),
      );
      return getDb().transaction(async (tx) => {
        const [row] = await tx
          .insert(recipe)
          .values({
            accountId: ctx.account.accountId,
            name: input.name,
            category: input.category,
            sellPriceCents: toCents(input.sellPrice),
            notes: input.notes,
            createdByUserId: ctx.account.userId,
          })
          .returning();
        if (!row) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
        if (lines.length > 0) {
          await tx.insert(recipeIngredient).values(
            lines.map((l) => ({
              accountId: ctx.account.accountId,
              recipeId: row.id,
              ingredientId: l.ingredientId,
              qty: l.qty,
            })),
          );
        }
        return row;
      });
    }),

  update: opsProcedure
    .input(z.object({ id: z.string().uuid(), data: recipeInput }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      const lines = normalizeLines(input.data.lines);
      await assertIngredientsOwned(
        ctx.account.accountId,
        lines.map((l) => l.ingredientId),
      );
      return getDb().transaction(async (tx) => {
        const [row] = await tx
          .update(recipe)
          .set({
            name: input.data.name,
            category: input.data.category,
            sellPriceCents: toCents(input.data.sellPrice),
            notes: input.data.notes,
            updatedAt: new Date(),
          })
          .where(eq(recipe.id, input.id))
          .returning();
        // Replace the bill of materials wholesale (join is hard-deletable).
        await tx
          .delete(recipeIngredient)
          .where(eq(recipeIngredient.recipeId, input.id));
        if (lines.length > 0) {
          await tx.insert(recipeIngredient).values(
            lines.map((l) => ({
              accountId: ctx.account.accountId,
              recipeId: input.id,
              ingredientId: l.ingredientId,
              qty: l.qty,
            })),
          );
        }
        return row;
      });
    }),

  archive: opsProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(async ({ ctx, input }) => {
      await assertOwned(ctx.account.accountId, input.id);
      const [row] = await getDb()
        .update(recipe)
        .set({ archivedAt: new Date(), updatedAt: new Date() })
        .where(eq(recipe.id, input.id))
        .returning();
      return row;
    }),
});

async function assertOwned(accountId: string, id: string): Promise<void> {
  const [owned] = await getDb()
    .select({ id: recipe.id })
    .from(recipe)
    .where(and(eq(recipe.id, id), eq(recipe.accountId, accountId)))
    .limit(1);
  if (!owned) throw new TRPCError({ code: "NOT_FOUND" });
}
