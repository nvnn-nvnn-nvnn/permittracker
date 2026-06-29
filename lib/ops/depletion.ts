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
      truckId: recipe.truckId,
      name: recipe.name,
      ingredientId: recipeIngredient.ingredientId,
      qty: recipeIngredient.qty,
    })
    .from(recipe)
    .innerJoin(recipeIngredient, eq(recipeIngredient.recipeId, recipe.id))
    .where(and(eq(recipe.accountId, accountId), isNull(recipe.archivedAt)));

  // Keyed by truck + normalized name — a sale only matches a recipe on its
  // own truck (Option B: each truck owns its recipes/ingredients).
  const linesByTruckName = new Map<
    string,
    { ingredientId: string; qty: number }[]
  >();
  const tnKey = (truckId: string | null, name: string) =>
    `${truckId ?? "none"}|${norm(name)}`;
  for (const r of recipeLines) {
    const key = tnKey(r.truckId, r.name);
    const arr = linesByTruckName.get(key) ?? [];
    arr.push({ ingredientId: r.ingredientId, qty: r.qty });
    linesByTruckName.set(key, arr);
  }

  // 2. Item sales in range.
  const items = await db
    .select({
      truckId: salesItemDay.truckId,
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

  // 3. Target usage per (dateKey|ingredientId). Ingredient ids are truck-
  //    specific, so the key is implicitly per-truck; we carry truckId for the
  //    ledger row.
  const target = new Map<string, number>();
  const meta = new Map<
    string,
    { dateKey: string; ingredientId: string; truckId: string | null }
  >();
  const dateKeys = new Set<string>();
  let matchedItems = 0;
  let unmatchedItems = 0;
  for (const it of items) {
    const lines = linesByTruckName.get(tnKey(it.truckId, it.itemName));
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
        meta.set(key, {
          dateKey,
          ingredientId: l.ingredientId,
          truckId: it.truckId,
        });
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
      meta.set(key, {
        dateKey: ymd(e.businessDate),
        ingredientId: e.ingredientId,
        truckId: e.truckId,
      });
  }

  // 5. Ingredient unit costs (all, incl. archived).
  const ings = await db
    .select({ id: ingredient.id, unitCostCents: ingredient.unitCostCents })
    .from(ingredient)
    .where(eq(ingredient.accountId, accountId));
  const costById = new Map(ings.map((i) => [i.id, i.unitCostCents]));

  // 6. Reconcile (batched). Build everything in memory first, then write in a
  //    short transaction: one UPDATE per touched ingredient + a single bulk
  //    usage upsert. Per-key round-trips inside the txn held row locks for the
  //    whole 90-day loop, which collided with overlapping syncs and tripped the
  //    DB statement timeout — batching keeps the locks held for milliseconds.
  const allKeys = new Set<string>([...target.keys(), ...priorByKey.keys()]);
  const now = new Date();

  // Net on-hand delta per ingredient (delta>0 consumes; delta<0 restocks).
  const deltaByIngredient = new Map<string, number>();
  const usageRows: (typeof inventoryUsage.$inferInsert)[] = [];
  for (const key of allKeys) {
    const m = meta.get(key);
    if (!m) continue;
    const targetQty = target.get(key) ?? 0;
    const priorQty = priorByKey.get(key) ?? 0;
    const delta = targetQty - priorQty;
    if (delta !== 0) {
      deltaByIngredient.set(
        m.ingredientId,
        (deltaByIngredient.get(m.ingredientId) ?? 0) + delta,
      );
    }
    const unitCost = costById.get(m.ingredientId) ?? 0;
    usageRows.push({
      accountId,
      truckId: m.truckId,
      source: "square",
      businessDate: new Date(`${m.dateKey}T00:00:00Z`),
      ingredientId: m.ingredientId,
      qtyUsed: targetQty,
      costCents: Math.round(targetQty * unitCost),
      updatedAt: now,
    });
  }
  const touched = new Set<string>(deltaByIngredient.keys());

  await db.transaction(async (tx) => {
    // Serialize concurrent depletions for this account so overlapping syncs
    // queue instead of deadlocking on the same ingredient/usage rows.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${accountId}))`);

    for (const [ingredientId, delta] of deltaByIngredient) {
      await tx
        .update(ingredient)
        .set({
          onHandQty: sql`${ingredient.onHandQty} - ${delta}`,
          updatedAt: now,
        })
        .where(eq(ingredient.id, ingredientId));
    }

    if (usageRows.length > 0) {
      // Keys are unique by construction (target/meta are keyed by
      // dateKey|ingredientId), so a single multi-row upsert is safe.
      await tx
        .insert(inventoryUsage)
        .values(usageRows)
        .onConflictDoUpdate({
          target: [
            inventoryUsage.accountId,
            inventoryUsage.source,
            inventoryUsage.businessDate,
            inventoryUsage.ingredientId,
          ],
          set: {
            qtyUsed: sql`excluded.qty_used`,
            costCents: sql`excluded.cost_cents`,
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
