import "server-only";
import { and, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import {
  expense,
  purchaseOrder,
  purchaseOrderItem,
  salesDay,
} from "@/lib/db/schema";

/**
 * Weekly P&L.
 *
 * Aggregates the daily Square rollups (sales_day) into Mon–Sun weeks, then
 * subtracts food cost (supplier purchases received, bucketed by receivedAt)
 * and overhead (expense ledger, bucketed by spentOn). "Food cost" here is
 * ACTUAL supplier spend, not theoretical per-recipe COGS — accurate dollars but
 * lumpy week-to-week (bulk buys), which is why the trailing food-cost % in
 * `totals` is the number to watch. True per-recipe COGS is a later layer.
 */
export interface WeeklyPnl {
  /** Monday, YYYY-MM-DD (UTC). */
  weekStart: string;
  /** Sunday, YYYY-MM-DD (UTC). */
  weekEnd: string;
  grossSalesCents: number;
  refundsCents: number;
  netSalesCents: number;
  taxCents: number;
  tipsCents: number;
  discountsCents: number;
  transactionCount: number;
  avgTicketCents: number;
  /** Net sales change vs. the previous week, in cents (null for first week). */
  netChangeCents: number | null;
  // --- Expense side ---
  /** Food cost = supplier purchases received this week (actual spend). */
  foodCostCents: number;
  /** Overhead from the expense ledger, bucketed by spent-on date. */
  overheadCents: number;
  /** net sales − food cost − overhead. */
  operatingProfitCents: number;
}

/** Monday (UTC) of the ISO week containing `d`. */
function weekStartUtc(d: Date): Date {
  const x = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
  const dow = x.getUTCDay(); // 0=Sun..6=Sat
  const diff = dow === 0 ? 6 : dow - 1; // days since Monday
  x.setUTCDate(x.getUTCDate() - diff);
  return x;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface WeeklyPnlResult {
  weeks: WeeklyPnl[];
  hasData: boolean;
  /** Trailing totals across the returned window — the headline KPIs. */
  totals: {
    netSalesCents: number;
    foodCostCents: number;
    overheadCents: number;
    operatingProfitCents: number;
    /** food cost ÷ net sales × 100, rounded; null when no net sales. */
    foodCostPct: number | null;
  };
}

const EMPTY_TOTALS: WeeklyPnlResult["totals"] = {
  netSalesCents: 0,
  foodCostCents: 0,
  overheadCents: 0,
  operatingProfitCents: 0,
  foodCostPct: null,
};

/**
 * Most recent `weeks` complete-or-current weeks of P&L, newest first.
 */
export async function weeklyPnl(
  accountId: string,
  weeks = 8,
): Promise<WeeklyPnlResult> {
  const db = getDb();

  const since = weekStartUtc(new Date());
  since.setUTCDate(since.getUTCDate() - (weeks - 1) * 7);

  const [salesRows, expenseRows, purchaseRows] = await Promise.all([
    db
      .select()
      .from(salesDay)
      .where(
        and(
          eq(salesDay.accountId, accountId),
          gte(salesDay.businessDate, since),
        ),
      ),
    db
      .select({ spentOn: expense.spentOn, amountCents: expense.amountCents })
      .from(expense)
      .where(
        and(eq(expense.accountId, accountId), gte(expense.spentOn, since)),
      ),
    // Food cost = received purchase orders, totalled per order, by receivedAt.
    db
      .select({
        receivedAt: purchaseOrder.receivedAt,
        totalCents: sql<number>`coalesce(round(sum(${purchaseOrderItem.qty} * ${purchaseOrderItem.unitCostCents}))::int, 0)`,
      })
      .from(purchaseOrder)
      .leftJoin(
        purchaseOrderItem,
        eq(purchaseOrderItem.purchaseOrderId, purchaseOrder.id),
      )
      .where(
        and(
          eq(purchaseOrder.accountId, accountId),
          eq(purchaseOrder.status, "received"),
          gte(purchaseOrder.receivedAt, since),
        ),
      )
      .groupBy(purchaseOrder.id, purchaseOrder.receivedAt),
  ]);

  if (
    salesRows.length === 0 &&
    expenseRows.length === 0 &&
    purchaseRows.length === 0
  ) {
    return { weeks: [], hasData: false, totals: EMPTY_TOTALS };
  }

  // Bucket days/expenses into their week-start key (creating weeks on demand).
  const byWeek = new Map<string, WeeklyPnl>();
  const ensure = (date: Date): WeeklyPnl => {
    const ws = weekStartUtc(date);
    const key = ymd(ws);
    let w = byWeek.get(key);
    if (!w) {
      const we = new Date(ws);
      we.setUTCDate(we.getUTCDate() + 6);
      w = {
        weekStart: key,
        weekEnd: ymd(we),
        grossSalesCents: 0,
        refundsCents: 0,
        netSalesCents: 0,
        taxCents: 0,
        tipsCents: 0,
        discountsCents: 0,
        transactionCount: 0,
        avgTicketCents: 0,
        netChangeCents: null,
        foodCostCents: 0,
        overheadCents: 0,
        operatingProfitCents: 0,
      };
      byWeek.set(key, w);
    }
    return w;
  };

  for (const r of salesRows) {
    const w = ensure(r.businessDate);
    w.grossSalesCents += r.grossSalesCents;
    w.refundsCents += r.refundsCents;
    w.netSalesCents += r.netSalesCents;
    w.taxCents += r.taxCents;
    w.tipsCents += r.tipsCents;
    w.discountsCents += r.discountsCents;
    w.transactionCount += r.transactionCount;
  }
  for (const e of expenseRows) {
    ensure(e.spentOn).overheadCents += e.amountCents;
  }
  for (const p of purchaseRows) {
    if (p.receivedAt) ensure(p.receivedAt).foodCostCents += Number(p.totalCents);
  }

  // Oldest → newest for week-over-week math.
  const asc = [...byWeek.values()].sort((a, b) =>
    a.weekStart.localeCompare(b.weekStart),
  );
  let prevNet: number | null = null;
  for (const w of asc) {
    w.avgTicketCents =
      w.transactionCount > 0
        ? Math.round(w.netSalesCents / w.transactionCount)
        : 0;
    w.netChangeCents = prevNet === null ? null : w.netSalesCents - prevNet;
    w.operatingProfitCents =
      w.netSalesCents - w.foodCostCents - w.overheadCents;
    prevNet = w.netSalesCents;
  }

  // Newest first for display; cap to requested count.
  const weeksOut = asc.reverse().slice(0, weeks);

  // Trailing totals across the returned window (the headline KPIs).
  const totals = weeksOut.reduce(
    (acc, w) => {
      acc.netSalesCents += w.netSalesCents;
      acc.foodCostCents += w.foodCostCents;
      acc.overheadCents += w.overheadCents;
      acc.operatingProfitCents += w.operatingProfitCents;
      return acc;
    },
    { ...EMPTY_TOTALS, foodCostPct: null as number | null },
  );
  totals.foodCostPct =
    totals.netSalesCents > 0
      ? Math.round((totals.foodCostCents / totals.netSalesCents) * 100)
      : null;

  return { weeks: weeksOut, hasData: true, totals };
}
