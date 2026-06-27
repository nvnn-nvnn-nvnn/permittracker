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
 * P&L by period (day / week / month).
 *
 * Aggregates the daily Square rollups (sales_day) into the chosen period, then
 * subtracts food cost (supplier purchases received, by receivedAt) and overhead
 * (expense ledger, by spentOn). "Food cost" is ACTUAL supplier spend, not
 * theoretical per-recipe COGS — accurate but lumpy, so the trailing food-cost %
 * in `totals` is the number to watch.
 */
export type PnlGranularity = "day" | "week" | "month";

export interface PnlPeriod {
  /** Period start, YYYY-MM-DD (UTC). */
  periodStart: string;
  /** Period end, YYYY-MM-DD (UTC). */
  periodEnd: string;
  /** Display label, e.g. "Jun 16", "Jun 16–22", or "Jun 2026". */
  label: string;
  grossSalesCents: number;
  refundsCents: number;
  netSalesCents: number;
  taxCents: number;
  tipsCents: number;
  discountsCents: number;
  transactionCount: number;
  avgTicketCents: number;
  /** Net sales change vs. the previous period (null for the first). */
  netChangeCents: number | null;
  foodCostCents: number;
  overheadCents: number;
  /** net sales − food cost − overhead. */
  operatingProfitCents: number;
}

export interface PnlResult {
  granularity: PnlGranularity;
  /** Newest period first. */
  periods: PnlPeriod[];
  hasData: boolean;
  totals: {
    netSalesCents: number;
    foodCostCents: number;
    overheadCents: number;
    operatingProfitCents: number;
    foodCostPct: number | null;
  };
}

const EMPTY_TOTALS: PnlResult["totals"] = {
  netSalesCents: 0,
  foodCostCents: 0,
  overheadCents: 0,
  operatingProfitCents: 0,
  foodCostPct: null,
};

export function defaultPeriods(g: PnlGranularity): number {
  return g === "day" ? 14 : g === "month" ? 12 : 8;
}

function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/** Start of the period (UTC) containing `d`. Week = Monday. */
function startOf(d: Date, g: PnlGranularity): Date {
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  const day = d.getUTCDate();
  if (g === "day") return new Date(Date.UTC(y, m, day));
  if (g === "month") return new Date(Date.UTC(y, m, 1));
  const x = new Date(Date.UTC(y, m, day));
  const dow = x.getUTCDay(); // 0=Sun
  x.setUTCDate(x.getUTCDate() - (dow === 0 ? 6 : dow - 1));
  return x;
}

function endOf(start: Date, g: PnlGranularity): Date {
  if (g === "day") return new Date(start);
  if (g === "month")
    return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0));
  const e = new Date(start);
  e.setUTCDate(e.getUTCDate() + 6);
  return e;
}

/** Move a period start back by `n` periods. */
function shiftBack(start: Date, g: PnlGranularity, n: number): Date {
  const s = new Date(start);
  if (g === "day") {
    s.setUTCDate(s.getUTCDate() - n);
    return s;
  }
  if (g === "month")
    return new Date(Date.UTC(s.getUTCFullYear(), s.getUTCMonth() - n, 1));
  s.setUTCDate(s.getUTCDate() - n * 7);
  return s;
}

function labelOf(start: Date, g: PnlGranularity): string {
  if (g === "month")
    return start.toLocaleDateString("en-US", {
      month: "short",
      year: "numeric",
      timeZone: "UTC",
    });
  if (g === "day")
    return start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    });
  const end = endOf(start, "week");
  const a = start.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const b = end.toLocaleDateString("en-US", { day: "numeric", timeZone: "UTC" });
  return `${a}–${b}`;
}

export async function periodPnl(
  accountId: string,
  granularity: PnlGranularity = "week",
  periods?: number,
): Promise<PnlResult> {
  const db = getDb();
  const count = periods ?? defaultPeriods(granularity);
  const since = shiftBack(
    startOf(new Date(), granularity),
    granularity,
    count - 1,
  );

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
    return { granularity, periods: [], hasData: false, totals: EMPTY_TOTALS };
  }

  const byPeriod = new Map<string, PnlPeriod>();
  const ensure = (date: Date): PnlPeriod => {
    const start = startOf(date, granularity);
    const key = ymd(start);
    let p = byPeriod.get(key);
    if (!p) {
      p = {
        periodStart: key,
        periodEnd: ymd(endOf(start, granularity)),
        label: labelOf(start, granularity),
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
      byPeriod.set(key, p);
    }
    return p;
  };

  for (const r of salesRows) {
    const p = ensure(r.businessDate);
    p.grossSalesCents += r.grossSalesCents;
    p.refundsCents += r.refundsCents;
    p.netSalesCents += r.netSalesCents;
    p.taxCents += r.taxCents;
    p.tipsCents += r.tipsCents;
    p.discountsCents += r.discountsCents;
    p.transactionCount += r.transactionCount;
  }
  for (const e of expenseRows) {
    ensure(e.spentOn).overheadCents += e.amountCents;
  }
  for (const pr of purchaseRows) {
    if (pr.receivedAt)
      ensure(pr.receivedAt).foodCostCents += Number(pr.totalCents);
  }

  const asc = [...byPeriod.values()].sort((a, b) =>
    a.periodStart.localeCompare(b.periodStart),
  );
  let prevNet: number | null = null;
  for (const p of asc) {
    p.avgTicketCents =
      p.transactionCount > 0
        ? Math.round(p.netSalesCents / p.transactionCount)
        : 0;
    p.netChangeCents = prevNet === null ? null : p.netSalesCents - prevNet;
    p.operatingProfitCents =
      p.netSalesCents - p.foodCostCents - p.overheadCents;
    prevNet = p.netSalesCents;
  }

  const periodsOut = asc.reverse().slice(0, count);

  const totals = periodsOut.reduce(
    (acc, p) => {
      acc.netSalesCents += p.netSalesCents;
      acc.foodCostCents += p.foodCostCents;
      acc.overheadCents += p.overheadCents;
      acc.operatingProfitCents += p.operatingProfitCents;
      return acc;
    },
    { ...EMPTY_TOTALS, foodCostPct: null as number | null },
  );
  totals.foodCostPct =
    totals.netSalesCents > 0
      ? Math.round((totals.foodCostCents / totals.netSalesCents) * 100)
      : null;

  return { granularity, periods: periodsOut, hasData: true, totals };
}
