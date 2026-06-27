import "server-only";
import { and, eq, gte, isNull, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  ingredient,
  recipe,
  recipeIngredient,
  salesItemDay,
} from "@/lib/db/schema";

/**
 * Menu engineering — classify each sold menu item by popularity × profitability
 * (the classic Star / Plowhorse / Puzzle / Dog matrix) by matching Square
 * item-level sales to recipe cost. Needs Slice 2b recipes + Tier-A step-1 item
 * sales. Matching is by normalized item name (POS button name == recipe name).
 */
export type MenuClass = "star" | "plowhorse" | "puzzle" | "dog";

export interface MenuItemAnalysis {
  itemName: string;
  recipeId: string;
  unitsSold: number;
  grossSalesCents: number;
  sellPriceCents: number;
  cogsCents: number;
  /** Per-unit contribution margin. */
  marginCents: number;
  marginPct: number | null;
  /** unitsSold × marginCents — total contribution over the window. */
  totalProfitCents: number;
  klass: MenuClass;
  recommendation: string;
}

export interface MenuUnmatchedItem {
  itemName: string;
  unitsSold: number;
  grossSalesCents: number;
}

export interface MenuAnalysisResult {
  matched: MenuItemAnalysis[];
  /** Items sold in Square with no matching recipe (can't cost them yet). */
  unmatched: MenuUnmatchedItem[];
  hasData: boolean;
  /** Thresholds used to split high/low (averages across matched items). */
  thresholds: { avgUnits: number; avgMarginCents: number } | null;
}

const RECS: Record<MenuClass, string> = {
  star: "Star — sells well and makes money. Feature it; protect the recipe.",
  plowhorse:
    "Popular but thin margin. Nudge the price up or trim recipe cost.",
  puzzle: "High margin but slow. Promote it, reposition it, or rename it.",
  dog: "Low sales and low margin — a strong candidate to cut from the menu.",
};

function classify(
  unitsSold: number,
  marginCents: number,
  avgUnits: number,
  avgMarginCents: number,
): MenuClass {
  const popular = unitsSold >= avgUnits;
  const profitable = marginCents >= avgMarginCents;
  if (popular && profitable) return "star";
  if (popular && !profitable) return "plowhorse";
  if (!popular && profitable) return "puzzle";
  return "dog";
}

const norm = (s: string) => s.trim().toLowerCase();

export async function menuAnalysis(
  accountId: string,
  days = 30,
): Promise<MenuAnalysisResult> {
  const db = getDb();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const [itemRows, recipeRows] = await Promise.all([
    db
      .select({
        itemName: salesItemDay.itemName,
        unitsSold: sql<number>`sum(${salesItemDay.qtySold})`,
        grossSalesCents: sql<number>`sum(${salesItemDay.grossSalesCents})::int`,
      })
      .from(salesItemDay)
      .where(
        and(
          eq(salesItemDay.accountId, accountId),
          gte(salesItemDay.businessDate, since),
        ),
      )
      .groupBy(salesItemDay.itemName),
    db
      .select({
        id: recipe.id,
        name: recipe.name,
        sellPriceCents: recipe.sellPriceCents,
        cogsCents: sql<number>`coalesce(round(sum(${recipeIngredient.qty} * ${ingredient.unitCostCents}))::int, 0)`,
      })
      .from(recipe)
      .leftJoin(recipeIngredient, eq(recipeIngredient.recipeId, recipe.id))
      .leftJoin(ingredient, eq(ingredient.id, recipeIngredient.ingredientId))
      .where(and(eq(recipe.accountId, accountId), isNull(recipe.archivedAt)))
      .groupBy(recipe.id),
  ]);

  if (itemRows.length === 0) {
    return { matched: [], unmatched: [], hasData: false, thresholds: null };
  }

  const recipeByName = new Map(
    recipeRows.map((r) => [norm(r.name), r]),
  );

  // First pass — split matched vs. unmatched and compute per-unit margins.
  const base: Omit<MenuItemAnalysis, "klass" | "recommendation">[] = [];
  const unmatched: MenuUnmatchedItem[] = [];
  for (const it of itemRows) {
    const unitsSold = Number(it.unitsSold);
    const grossSalesCents = Number(it.grossSalesCents);
    const r = recipeByName.get(norm(it.itemName));
    if (!r) {
      unmatched.push({ itemName: it.itemName, unitsSold, grossSalesCents });
      continue;
    }
    const cogsCents = Number(r.cogsCents);
    const marginCents = r.sellPriceCents - cogsCents;
    base.push({
      itemName: it.itemName,
      recipeId: r.id,
      unitsSold,
      grossSalesCents,
      sellPriceCents: r.sellPriceCents,
      cogsCents,
      marginCents,
      marginPct:
        r.sellPriceCents > 0
          ? Math.round((marginCents / r.sellPriceCents) * 100)
          : null,
      totalProfitCents: Math.round(unitsSold * marginCents),
    });
  }

  // Thresholds = simple averages across matched items.
  const thresholds =
    base.length > 0
      ? {
          avgUnits:
            base.reduce((s, b) => s + b.unitsSold, 0) / base.length,
          avgMarginCents:
            base.reduce((s, b) => s + b.marginCents, 0) / base.length,
        }
      : null;

  const matched: MenuItemAnalysis[] = base
    .map((b) => {
      const klass = thresholds
        ? classify(
            b.unitsSold,
            b.marginCents,
            thresholds.avgUnits,
            thresholds.avgMarginCents,
          )
        : "star";
      return { ...b, klass, recommendation: RECS[klass] };
    })
    .sort((a, b) => b.totalProfitCents - a.totalProfitCents);

  unmatched.sort((a, b) => b.grossSalesCents - a.grossSalesCents);

  return { matched, unmatched, hasData: true, thresholds };
}
