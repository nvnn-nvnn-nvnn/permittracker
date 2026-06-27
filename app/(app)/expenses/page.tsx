import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtMoneyCents, fmtDate } from "@/lib/format";

export const metadata = { title: "Expenses · VendGuard" };
export const dynamic = "force-dynamic";

export default async function ExpensesPage() {
  const api = await serverApi();
  const [expenses, summary] = await Promise.all([
    api.expenses.list(),
    api.expenses.summary({ days: 30 }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Expenses</h1>
          <p className="text-sm text-muted-foreground">
            Overhead you pay to operate — feeds your weekly P&amp;L.
          </p>
        </div>
        <Link href="/expenses/new" className={buttonVariants({ size: "sm" })}>
          Add expense
        </Link>
      </div>

      {expenses.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No expenses yet</CardTitle>
            <CardDescription>
              Log overhead like rent, insurance, fuel, and permits. Each expense
              lands in its week on the Operations P&amp;L.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <div className="flex items-baseline justify-between p-5">
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {fmtMoneyCents(summary.totalCents)}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Last 30 days · {summary.count} expense
                  {summary.count === 1 ? "" : "s"}
                </p>
              </div>
            </div>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="divide-y">
              {expenses.map((e) => (
                <Link
                  key={e.id}
                  href={`/expenses/${e.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {e.description}
                      {e.category && (
                        <Badge variant="outline">{e.category}</Badge>
                      )}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {fmtDate(e.spentOn)}
                      {e.vendorName ? ` · ${e.vendorName}` : ""}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium tabular-nums">
                    {fmtMoneyCents(e.amountCents)}
                  </p>
                </Link>
              ))}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
