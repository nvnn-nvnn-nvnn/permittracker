import Link from "next/link";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  Boxes,
  Receipt,
  AlertTriangle,
  MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { requireAccountContext } from "@/lib/auth/session";
import { accountHasOperations } from "@/lib/limits";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { SquareSync } from "@/components/features/square-sync";
import { fmtMoneyCents, fmtDate } from "@/lib/format";

export const metadata = { title: "Operations · VendGuard" };
export const dynamic = "force-dynamic";

export default async function OperationsPage() {
  const [ctx, api] = await Promise.all([
    requireAccountContext(),
    serverApi(),
  ]);

  if (!(await accountHasOperations(ctx.accountId))) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
        <Card>
          <CardContent className="flex flex-col items-center gap-3 p-10 text-center">
            <p className="text-lg font-semibold">
              Stay profitable — on Pro and up
            </p>
            <p className="max-w-md text-sm text-muted-foreground">
              The Operations tools — Square sales sync, weekly P&amp;L,
              inventory, recipes, purchasing, and expenses — are part of the Pro
              plan. Upgrade to turn sales into a clear profit picture.
            </p>
            <Link
              href="/settings"
              className={buttonVariants({ size: "sm" })}
            >
              Upgrade in Billing
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const [
    { connection, isSquareConfigured },
    pnl,
    inventory,
    expenses,
    topItems,
    actualCogs,
    truckStatuses,
  ] = await Promise.all([
    api.ops.connection(),
    api.ops.weeklyPnl({ weeks: 8 }),
    api.inventory.summary(),
    api.expenses.summary({ days: 30 }),
    api.ops.itemSales({ days: 30 }),
    api.ops.actualCogs(),
    api.truck.statusList(),
  ]);

  const latest = pnl.weeks[0];

  const tiles = latest
    ? [
        {
          label: "Net sales",
          value: fmtMoneyCents(latest.netSalesCents),
          tone: "text-foreground",
        },
        {
          label: "Gross",
          value: fmtMoneyCents(latest.grossSalesCents),
          tone: "text-muted-foreground",
        },
        {
          label: "Transactions",
          value: latest.transactionCount.toLocaleString("en-US"),
          tone: "text-muted-foreground",
        },
        {
          label: "Avg ticket",
          value: fmtMoneyCents(latest.avgTicketCents),
          tone: "text-muted-foreground",
        },
      ]
    : [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
          <p className="text-sm text-muted-foreground">
            {ctx.accountName} · Stay profitable — your sales, week by week.
          </p>
        </div>
        <Link
          href="/operations/export"
          className="text-sm font-medium text-brand-ink hover:underline"
        >
          Export to QuickBooks →
        </Link>
      </div>

      {/* Connection / sync */}
      <Card>
        <CardContent className="p-5">
          <SquareSync
            connection={
              connection
                ? {
                    connected: connection.connected,
                    locationName: connection.locationName,
                    environment: connection.environment,
                    lastSyncedAt: connection.lastSyncedAt,
                  }
                : null
            }
            isSquareConfigured={isSquareConfigured}
          />
        </CardContent>
      </Card>

      {/* Service status — where each truck is and whether it's serving */}
      {truckStatuses.length > 0 && (
        <Card>
          <CardContent className="p-5">
            <div className="mb-3 flex items-center gap-2">
              <MapPin className="size-4 text-brand-ink" />
              <p className="text-sm font-medium">Service status</p>
            </div>
            <div className="space-y-1">
              {truckStatuses.map((t) => (
                <Link
                  key={t.truckId}
                  href={`/trucks/${t.truckId}`}
                  className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-accent/40"
                >
                  <span className="flex min-w-0 items-center gap-2">
                    <Badge
                      variant={
                        t.serviceStatus === "open" ? "green" : "outline"
                      }
                    >
                      {t.serviceStatus === "open" ? "Open" : "Closed"}
                    </Badge>
                    <span className="truncate font-medium">{t.name}</span>
                  </span>
                  <span className="shrink-0 truncate text-xs text-muted-foreground">
                    {t.currentLocation ?? "—"}
                    {t.serviceWindow ? ` · ${t.serviceWindow}` : ""}
                  </span>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Inventory snapshot — links into the Inventory pillar */}
      {inventory.count > 0 && (
        <Link href="/inventory" className="block">
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                  <Boxes className="size-4 text-brand-ink" />
                </span>
                <div>
                  <p className="text-sm font-medium">Inventory</p>
                  <p className="text-xs text-muted-foreground">
                    {inventory.count} ingredient
                    {inventory.count === 1 ? "" : "s"} ·{" "}
                    {fmtMoneyCents(inventory.valueCents)} on hand
                  </p>
                </div>
              </div>
              {inventory.lowStock > 0 && (
                <span className="flex items-center gap-1.5 text-sm font-medium text-status-yellow">
                  <AlertTriangle className="size-4" />
                  {inventory.lowStock} low
                </span>
              )}
            </CardContent>
          </Card>
        </Link>
      )}

      {/* Expenses snapshot — links into the expense ledger */}
      {expenses.count > 0 && (
        <Link href="/expenses" className="block">
          <Card className="transition-colors hover:bg-accent/40">
            <CardContent className="flex items-center justify-between gap-4 p-5">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-lg bg-secondary">
                  <Receipt className="size-4 text-brand-ink" />
                </span>
                <div>
                  <p className="text-sm font-medium">Overhead</p>
                  <p className="text-xs text-muted-foreground">
                    {fmtMoneyCents(expenses.totalCents)} across{" "}
                    {expenses.count} expense
                    {expenses.count === 1 ? "" : "s"} · last 30 days
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {!pnl.hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-sm font-medium">No sales yet</p>
            <p className="max-w-sm text-sm text-muted-foreground">
              Connect Square (or load demo data) above to see your weekly
              performance. We&apos;ll roll up gross, refunds, net sales, and
              average ticket — week over week.
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Latest week hero */}
          {latest && (
            <Card>
              <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Latest week
                  </p>
                  <p className="text-sm font-medium">
                    {fmtDate(latest.weekStart)} – {fmtDate(latest.weekEnd)}
                  </p>
                  <WoW change={latest.netChangeCents} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
                  {tiles.map((t) => (
                    <div key={t.label} className="text-center sm:text-right">
                      <p
                        className={`text-xl font-semibold tabular-nums ${t.tone}`}
                      >
                        {t.value}
                      </p>
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                        {t.label}
                      </p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Trailing totals — the headline KPIs (food-cost % is the one) */}
          <Card>
            <CardContent className="grid grid-cols-2 gap-4 p-5 sm:grid-cols-4">
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {fmtMoneyCents(pnl.totals.netSalesCents)}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Net sales · last {pnl.weeks.length}w
                </p>
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {pnl.totals.foodCostPct !== null
                    ? `${pnl.totals.foodCostPct}%`
                    : "—"}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Food cost % · {fmtMoneyCents(pnl.totals.foodCostCents)}
                </p>
              </div>
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {fmtMoneyCents(pnl.totals.overheadCents)}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Overhead
                </p>
              </div>
              <div>
                <p
                  className={`text-xl font-semibold tabular-nums ${
                    pnl.totals.operatingProfitCents < 0
                      ? "text-status-red"
                      : "text-status-green"
                  }`}
                >
                  {fmtMoneyCents(pnl.totals.operatingProfitCents)}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Operating profit
                </p>
              </div>
            </CardContent>
          </Card>

          {/* Actual food cost (between the two most recent counts) */}
          {actualCogs.available && (
            <Link href="/inventory/counts" className="block">
              <Card className="transition-colors hover:bg-accent/40">
                <CardContent className="flex items-center justify-between gap-4 p-5">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Actual food cost · {fmtDate(actualCogs.periodStart)} –{" "}
                      {fmtDate(actualCogs.periodEnd)}
                    </p>
                    <p className="mt-1 text-xl font-semibold tabular-nums">
                      {fmtMoneyCents(actualCogs.cogsCents)}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      opening {fmtMoneyCents(actualCogs.openingValueCents)} +
                      purchases {fmtMoneyCents(actualCogs.purchasesCents)} −
                      closing {fmtMoneyCents(actualCogs.closingValueCents)}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </Link>
          )}

          {/* Weekly P&L table */}
          <div className="space-y-3">
            <h2 className="text-lg font-bold tracking-tight">Weekly P&amp;L</h2>
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Week</th>
                        <th className="px-4 py-3 text-right font-medium">
                          Net sales
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Food cost
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Overhead
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Profit*
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {pnl.weeks.map((w) => (
                        <tr
                          key={w.weekStart}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-3">
                            <span className="font-medium">
                              {fmtDate(w.weekStart)}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {fmtMoneyCents(w.netSalesCents)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {w.foodCostCents > 0
                              ? `−${fmtMoneyCents(w.foodCostCents)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {w.overheadCents > 0
                              ? `−${fmtMoneyCents(w.overheadCents)}`
                              : "—"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-medium tabular-nums ${
                              w.operatingProfitCents < 0
                                ? "text-status-red"
                                : "text-foreground"
                            }`}
                          >
                            {fmtMoneyCents(w.operatingProfitCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
            <p className="text-xs text-muted-foreground">
              *Profit = net sales − food cost − overhead. Food cost is your{" "}
              <Link
                href="/purchasing"
                className="text-brand-ink hover:underline"
              >
                supplier purchases
              </Link>{" "}
              received that week (actual spend — lumpy week to week, so watch the
              trailing food-cost % above). Overhead comes from{" "}
              <Link href="/expenses" className="text-brand-ink hover:underline">
                expenses
              </Link>
              . True per-recipe COGS is a later layer.
            </p>
          </div>

          {/* Top items — Square line-item sales */}
          {topItems.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-bold tracking-tight">
                  Top items · last 30 days
                </h2>
                <Link
                  href="/operations/menu"
                  className="text-xs font-medium text-brand-ink hover:underline"
                >
                  Menu analysis →
                </Link>
              </div>
              <Card className="overflow-hidden p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Item</th>
                        <th className="px-4 py-3 text-right font-medium">
                          Units
                        </th>
                        <th className="px-4 py-3 text-right font-medium">
                          Sales
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {topItems.map((it) => (
                        <tr
                          key={it.itemName}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-3 font-medium">
                            {it.itemName}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {it.qtySold.toLocaleString("en-US")}
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {fmtMoneyCents(it.grossSalesCents)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
              <p className="text-xs text-muted-foreground">
                From Square line items. Next: match these to recipes for
                per-item margin and menu-simplification suggestions.
              </p>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/** Week-over-week net sales change pill. */
function WoW({ change }: { change: number | null }) {
  if (change === null) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" /> first tracked week
      </p>
    );
  }
  const up = change >= 0;
  return (
    <p
      className={`flex items-center gap-1 text-xs font-medium ${
        up ? "text-status-green" : "text-status-red"
      }`}
    >
      {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
      {up ? "+" : "−"}
      {fmtMoneyCents(Math.abs(change))} vs. prior week
    </p>
  );
}
