import "server-only";
import { and, asc, eq, gte, isNull } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { expense, salesDay } from "@/lib/db/schema";

/**
 * Builds a QuickBooks-importable transactions CSV (income + expenses) for the
 * last `days`. Columns: Date, Description, Category, Amount — positive for
 * sales income, negative for expenses — the 4-column shape QBO accepts as
 * imported bank transactions. This is the "barebones bookkeeping" QB fallback;
 * live QBO push is stubbed (see lib/quickbooks).
 */
function ymd(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function csvCell(s: string): string {
  // Quote and escape if the value contains a comma, quote, or newline.
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export interface FinancialExport {
  filename: string;
  csv: string;
  rowCount: number;
  netSalesCents: number;
  expenseCents: number;
}

export async function buildFinancialCsv(
  accountId: string,
  days = 90,
): Promise<FinancialExport> {
  const db = getDb();
  const since = new Date();
  since.setUTCDate(since.getUTCDate() - days);

  const [salesRows, expenseRows] = await Promise.all([
    db
      .select({
        businessDate: salesDay.businessDate,
        netSalesCents: salesDay.netSalesCents,
      })
      .from(salesDay)
      .where(
        and(
          eq(salesDay.accountId, accountId),
          gte(salesDay.businessDate, since),
        ),
      )
      .orderBy(asc(salesDay.businessDate)),
    db
      .select({
        spentOn: expense.spentOn,
        description: expense.description,
        category: expense.category,
        amountCents: expense.amountCents,
      })
      .from(expense)
      .where(
        and(
          eq(expense.accountId, accountId),
          isNull(expense.archivedAt),
          gte(expense.spentOn, since),
        ),
      )
      .orderBy(asc(expense.spentOn)),
  ]);

  interface Row {
    date: string;
    description: string;
    category: string;
    amountCents: number;
  }
  const rows: Row[] = [];
  let netSalesCents = 0;
  let expenseCents = 0;

  for (const s of salesRows) {
    if (s.netSalesCents === 0) continue;
    netSalesCents += s.netSalesCents;
    rows.push({
      date: ymd(s.businessDate),
      description: "Square sales",
      category: "Sales",
      amountCents: s.netSalesCents, // positive = income
    });
  }
  for (const e of expenseRows) {
    expenseCents += e.amountCents;
    rows.push({
      date: ymd(e.spentOn),
      description: e.description,
      category: e.category ?? "Expense",
      amountCents: -e.amountCents, // negative = money out
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));

  const header = "Date,Description,Category,Amount";
  const body = rows.map(
    (r) =>
      `${r.date},${csvCell(r.description)},${csvCell(r.category)},${dollars(
        r.amountCents,
      )}`,
  );
  const csv = [header, ...body].join("\n");

  const end = ymd(new Date());
  const filename = `cartledger-quickbooks-${ymd(since)}_to_${end}.csv`;

  return {
    filename,
    csv,
    rowCount: rows.length,
    netSalesCents,
    expenseCents,
  };
}
