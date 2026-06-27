import "server-only";
import { and, eq, gte, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  ingredient,
  inventoryUsage,
  recipe,
  recipeIngredient,
  salesItemDay,
} from "@/lib/db/schema";

/**
 * Auto-depletion (v1.1).
 *
 * Turns Square item sales into ingredient usage via recipes, decrements
 * ingredient on-hand, and records a per-day usage ledger (inventory_usage).
 *
 * IDEMPOTENT by design: for each (day, ingredient) it computes the *target*
 * usage from current sales × recipes, compares to the ledger's prior value,
 * and applies only the DELTA to on-hand — so re-syncing the same sales changes
 * nothing (delta 0), new sales deduct only what's new, and removed sales/
 * recipes add stock back. Matching is by normalized item name == recipe name;
 * items with no matching recipe (incl. typed-amount sales with no line item)
 * are skipped. Theoretical usage — physical counts remain the source of truth;
 * the gap between the two is shrink/variance.
 */
const norm = (s: string) => s.trim().toLowerCase();
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}
/** UTC midnight of a date (so date-column comparisons aren't time-skewed). */
function dayFloor(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export interface DepletionResult {
  daysProcessed: number;
  ingredientsTouched: number;
  matchedItems: number;
  unmatchedItems: number;
}

export async function applyUsageDepletion(
  accountId: string,
  start: Date,
  end: Date,
): Promise<DepletionResult> {
  const db = getDb();
  const from = dayFloor(start);
  const to = dayFloor(end);

  // 1. Active recipes → ingredient lines, grouped by normalized recipe name.
  const recipeLines = await db
    .select({
      name: recipe.name,
      ingredientId: recipeIngredient.ingredientId,
      qty: recipeIngredient.qty,
    })
    .from(recipe)
    .innerJoin(recipeIngredient, eq(recipeIngredient.recipeId, recipe.id))
    .where(and(eq(recipe.accountId, accountId), isNull(recipe.archivedAt)));

  const linesByName = new Map<
    string,
    { ingredientId: string; qty: number }[]
  >();
  for (const r of recipeLines) {
    const key = norm(r.name);
    const arr = linesByName.get(key) ?? [];
    arr.push({ ingredientId: r.ingredientId, qty: r.qty });
    linesByName.set(key, arr);
  }

  // 2. Item sales in range.
  const items = await db
    .select({
      businessDate: salesItemDay.businessDate,
      itemName: salesItemDay.itemName,
      qtySold: salesItemDay.qtySold,
    })
    .from(salesItemDay)
    .where(
      and(
        eq(salesItemDay.accountId, accountId),
        gte(salesItemDay.businessDate, from),
        lte(salesItemDay.businessDate, to),
      ),
    );

  // 3. Target usage per (dateKey|ingredientId).
  const target = new Map<string, number>();
  const meta = new Map<string, { dateKey: string; ingredientId: string }>();
  const dateKeys = new Set<string>();
  let matchedItems = 0;
  let unmatchedItems = 0;
  for (const it of items) {
    const lines = linesByName.get(norm(it.itemName));
    if (!lines) {
      unmatchedItems++;
      continue;
    }
    matchedItems++;
    const dateKey = ymd(it.businessDate);
    dateKeys.add(dateKey);
    for (const l of lines) {
      const key = `${dateKey}|${l.ingredientId}`;
      target.set(key, (target.get(key) ?? 0) + it.qtySold * l.qty);
      if (!meta.has(key))
        meta.set(key, { dateKey, ingredientId: l.ingredientId });
    }
  }

  // 4. Prior ledger rows in range.
  const existing = await db
    .select()
    .from(inventoryUsage)
    .where(
      and(
        eq(inventoryUsage.accountId, accountId),
        eq(inventoryUsage.source, "square"),
        gte(inventoryUsage.businessDate, from),
        lte(inventoryUsage.businessDate, to),
      ),
    );
  const priorByKey = new Map<string, number>();
  for (const e of existing) {
    const key = `${ymd(e.businessDate)}|${e.ingredientId}`;
    priorByKey.set(key, e.qtyUsed);
    if (!meta.has(key))
      meta.set(key, { dateKey: ymd(e.businessDate), ingredientId: e.ingredientId });
  }

  // 5. Ingredient unit costs (all, incl. archived).
  const ings = await db
    .select({ id: ingredient.id, unitCostCents: ingredient.unitCostCents })
    .from(ingredient)
    .where(eq(ingredient.accountId, accountId));
  const costById = new Map(ings.map((i) => [i.id, i.unitCostCents]));

  // 6. Reconcile: apply the delta to on-hand, set the ledger to target.
  const allKeys = new Set<string>([...target.keys(), ...priorByKey.keys()]);
  const touched = new Set<string>();
  const now = new Date();

  await db.transaction(async (tx) => {
    for (const key of allKeys) {
      const m = meta.get(key);
      if (!m) continue;
      const targetQty = target.get(key) ?? 0;
      const priorQty = priorByKey.get(key) ?? 0;
      const delta = targetQty - priorQty;
      const unitCost = costById.get(m.ingredientId) ?? 0;

      if (delta !== 0) {
        // More usage → less on-hand (delta>0 subtracts; delta<0 adds back).
        await tx
          .update(ingredient)
          .set({
            onHandQty: sql`${ingredient.onHandQty} - ${delta}`,
            updatedAt: now,
          })
          .where(eq(ingredient.id, m.ingredientId));
        touched.add(m.ingredientId);
      }

      await tx
        .insert(inventoryUsage)
        .values({
          accountId,
          source: "square",
          businessDate: new Date(`${m.dateKey}T00:00:00Z`),
          ingredientId: m.ingredientId,
          qtyUsed: targetQty,
          costCents: Math.round(targetQty * unitCost),
          updatedAt: now,
        })
        .onConflictDoUpdate({
          target: [
            inventoryUsage.accountId,
            inventoryUsage.source,
            inventoryUsage.businessDate,
            inventoryUsage.ingredientId,
          ],
          set: {
            qtyUsed: targetQty,
            costCents: Math.round(targetQty * unitCost),
            updatedAt: now,
          },
        });
    }
  });

  return {
    daysProcessed: dateKeys.size,
    ingredientsTouched: touched.size,
    matchedItems,
    unmatchedItems,
  };
}
