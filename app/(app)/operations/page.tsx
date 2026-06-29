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
import { OpsLineChart } from "@/components/features/ops-line-chart";
import { FoodCostExplainer } from "@/components/features/food-cost-explainer";
import { IncomeStatement } from "@/components/features/income-statement";
import { fmtMoneyCents, fmtDate } from "@/lib/format";
import type { PnlGranularity } from "@/lib/ops/pnl";

export const metadata = { title: "Operations · CartLedger" };
export const dynamic = "force-dynamic";

const GRANULARITIES: { key: PnlGranularity; label: string; noun: string }[] = [
  { key: "day", label: "Daily", noun: "day" },
  { key: "week", label: "Weekly", noun: "week" },
  { key: "month", label: "Monthly", noun: "month" },
];

export default async function OperationsPage({
  searchParams,
}: {
  searchParams: Promise<{ g?: string; truck?: string }>;
}) {
  const [{ g, truck }, ctx, api] = await Promise.all([
    searchParams,
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
              The Operations tools — Square sales sync, P&amp;L, inventory,
              recipes, purchasing, and expenses — are part of the Pro plan.
              Upgrade to turn sales into a clear profit picture.
            </p>
            <Link href="/settings" className={buttonVariants({ size: "sm" })}>
              Upgrade in Billing
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  const granularity: PnlGranularity =
    g === "day" || g === "month" ? g : "week";
  const noun =
    GRANULARITIES.find((x) => x.key === granularity)?.noun ?? "week";
  const selectedTruckId = typeof truck === "string" ? truck : undefined;

  const [
    squareSummary,
    pnl,
    inventory,
    expenses,
    topItems,
    actualCogs,
    truckStatuses,
    truckLocations,
  ] = await Promise.all([
    api.ops.connection(),
    api.ops.pnl({ granularity, truckId: selectedTruckId }),
    api.inventory.summary(),
    api.expenses.summary({ days: 30 }),
    api.ops.itemSales({ days: 30 }),
    api.ops.actualCogs({ truckId: selectedTruckId }),
    api.truck.statusList(),
    api.ops.truckLocations(),
  ]);

  // Truck switcher options (only the ones that exist); guard the selected id.
  const truckOptions = truckStatuses.map((t) => ({
    id: t.truckId,
    name: t.name,
  }));
  // Which trucks have a real (non-stub) Square location mapped.
  const connectedTruckIds = new Set(
    truckLocations
      .filter((t) => t.locationId && !t.locationId.startsWith("stub"))
      .map((t) => t.truckId),
  );
  const validTruckId = truckOptions.some((t) => t.id === selectedTruckId)
    ? selectedTruckId
    : undefined;
  const selectedTruckName = truckOptions.find(
    (t) => t.id === validTruckId,
  )?.name;
  const qs = (truckId?: string) =>
    `/operations?g=${granularity}${truckId ? `&truck=${truckId}` : ""}`;

  const latest = pnl.periods[0];
  const periodCount = pnl.periods.length;

  const tiles = latest
    ? [
        { label: "Net sales", value: fmtMoneyCents(latest.netSalesCents) },
        { label: "Gross", value: fmtMoneyCents(latest.grossSalesCents) },
        {
          label: "Transactions",
          value: latest.transactionCount.toLocaleString("en-US"),
        },
        { label: "Avg ticket", value: fmtMoneyCents(latest.avgTicketCents) },
      ]
    : [];

  // Chart series, oldest → newest.
  const chrono = [...pnl.periods].reverse();
  const chartLabels = chrono.map((p) => p.label);
  const chartSeries = [
    {
      name: "Net sales",
      colorClass: "text-brand-ink",
      dotClass: "bg-brand-ink",
      values: chrono.map((p) => p.netSalesCents),
    },
    {
      name: "Operating profit",
      colorClass: "text-status-green",
      dotClass: "bg-status-green",
      values: chrono.map((p) => p.operatingProfitCents),
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Operations</h1>
          <p className="text-sm text-muted-foreground">
            {ctx.accountName} · Stay profitable — sales and profit over time.
          </p>
        </div>
        <Link
          href="/operations/export"
          className="text-sm font-medium text-brand-ink hover:underline"
        >
          Export to QuickBooks →
        </Link>
      </div>

      {/* Beta / accuracy notice */}
      <div className="flex gap-3 rounded-xl border border-status-yellow/40 bg-status-yellow/10 p-4">
        <AlertTriangle className="size-4 shrink-0 text-status-yellow" />
        <div className="space-y-1 text-sm">
          <p className="font-medium">Beta — double-check your numbers.</p>
          <p className="text-muted-foreground">
            We don&apos;t sell your data or share your business data. These
            finance tools are in a beta period and aren&apos;t yet fully polished
            or accurate, so verify figures before relying on them. Questions or
            ideas to improve CartLedger? Email the team at{" "}
            <a
              href="mailto:techkage@proton.me"
              className="font-medium text-brand-ink hover:underline"
            >
              techkage@proton.me
            </a>
            .
          </p>
        </div>
      </div>

      {/* Connection / sync */}
      <Card>
        <CardContent className="p-5">
          <SquareSync summary={squareSummary} />
        </CardContent>
      </Card>

      {/* Service status */}
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
                      variant={t.serviceStatus === "open" ? "green" : "outline"}
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

      {/* Inventory snapshot */}
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

      {/* Expenses snapshot */}
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
                    {fmtMoneyCents(expenses.totalCents)} across {expenses.count}{" "}
                    expense{expenses.count === 1 ? "" : "s"} · last 30 days
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </Link>
      )}

      {/* P&L scope + granularity — ALWAYS visible so you can move between
          trucks regardless of Square connection or whether a truck has sales. */}
      <div className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-bold tracking-tight">
            P&amp;L
            <span className="ml-2 text-sm font-medium text-muted-foreground">
              · {selectedTruckName ?? "all trucks"}
            </span>
          </h2>
          <div className="flex items-center gap-1 rounded-full border bg-background p-0.5">
            {GRANULARITIES.map((x) => (
              <Link
                key={x.key}
                href={`/operations?g=${x.key}${validTruckId ? `&truck=${validTruckId}` : ""}`}
                scroll={false}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  x.key === granularity
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {x.label}
              </Link>
            ))}
          </div>
        </div>

        {/* Truck scope switcher — a green dot marks Square-connected trucks. */}
        {truckOptions.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Link
              href={qs(undefined)}
              scroll={false}
              className={`rounded-full border px-3 py-1 text-xs font-medium ${
                !validTruckId
                  ? "border-primary bg-primary/10 text-foreground"
                  : "bg-background text-muted-foreground hover:text-foreground"
              }`}
            >
              All trucks
            </Link>
            {truckOptions.map((t) => (
              <Link
                key={t.id}
                href={qs(t.id)}
                scroll={false}
                className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium ${
                  validTruckId === t.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                }`}
              >
                <span
                  className={`size-1.5 rounded-full ${
                    connectedTruckIds.has(t.id)
                      ? "bg-status-green"
                      : "bg-muted-foreground/40"
                  }`}
                  title={
                    connectedTruckIds.has(t.id)
                      ? "Square connected"
                      : "Not connected to Square"
                  }
                />
                {t.name}
              </Link>
            ))}
          </div>
        )}
      </div>

      {!pnl.hasData ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-2 p-10 text-center">
            <p className="text-sm font-medium">
              No sales yet{selectedTruckName ? ` for ${selectedTruckName}` : ""}
            </p>
            <p className="max-w-sm text-sm text-muted-foreground">
              {validTruckId
                ? connectedTruckIds.has(validTruckId)
                  ? "This truck's Square location is connected — hit Sync above to pull its sales, or switch to another truck."
                  : "This truck isn't connected to Square yet. Map its location in Operations → Square, or switch to another truck."
                : "Connect Square (or load demo data) above to see your performance — gross, refunds, net sales, food cost, and profit over time."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <>
          {/* Latest-period hero */}
          {latest && (
            <Card>
              <CardContent className="flex flex-col gap-5 p-6 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    Latest {noun}
                  </p>
                  <p className="text-sm font-medium">{latest.label}</p>
                  <WoW change={latest.netChangeCents} noun={noun} />
                </div>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-5">
                  {tiles.map((t) => (
                    <div key={t.label} className="text-center sm:text-right">
                      <p className="text-xl font-semibold tabular-nums">
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

          {/* Trailing income statement */}
          <IncomeStatement
            totals={pnl.totals}
            periodCount={periodCount}
            noun={noun}
            scopeName={selectedTruckName ?? "All trucks"}
          />

          <FoodCostExplainer />

          {/* Actual food cost */}
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

          {/* P&L chart + table (scope/granularity controls are above). */}
          <div className="space-y-3">
            <Card>
              <CardContent className="p-5">
                <OpsLineChart
                  labels={chartLabels}
                  series={chartSeries}
                  formatValue={fmtMoneyCents}
                />
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                        <th className="px-4 py-3 font-medium">Period</th>
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
                      {pnl.periods.map((p) => (
                        <tr
                          key={p.periodStart}
                          className="border-b last:border-0"
                        >
                          <td className="px-4 py-3">
                            <span className="font-medium">{p.label}</span>
                          </td>
                          <td className="px-4 py-3 text-right font-medium tabular-nums">
                            {fmtMoneyCents(p.netSalesCents)}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {p.foodCostCents > 0
                              ? `−${fmtMoneyCents(p.foodCostCents)}`
                              : "—"}
                          </td>
                          <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                            {p.overheadCents > 0
                              ? `−${fmtMoneyCents(p.overheadCents)}`
                              : "—"}
                          </td>
                          <td
                            className={`px-4 py-3 text-right font-medium tabular-nums ${
                              p.operatingProfitCents < 0
                                ? "text-status-red"
                                : "text-foreground"
                            }`}
                          >
                            {fmtMoneyCents(p.operatingProfitCents)}
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
              <Link href="/purchasing" className="text-brand-ink hover:underline">
                supplier purchases
              </Link>{" "}
              received in the period (actual spend — lumpy, so watch the trailing
              food-cost % above). Overhead comes from{" "}
              <Link href="/expenses" className="text-brand-ink hover:underline">
                expenses
              </Link>
              . True per-recipe COGS is a later layer.
            </p>
          </div>

          {/* Top items */}
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

/** Net-sales change vs. the previous period. */
function WoW({ change, noun }: { change: number | null; noun: string }) {
  if (change === null) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Minus className="size-3" /> first tracked {noun}
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
      {up ? (
        <TrendingUp className="size-3" />
      ) : (
        <TrendingDown className="size-3" />
      )}
      {up ? "+" : "−"}
      {fmtMoneyCents(Math.abs(change))} vs. prior {noun}
    </p>
  );
}
