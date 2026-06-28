import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtMoneyCents, fmtDate } from "@/lib/format";
import { TruckScopeTabs } from "@/components/features/truck-scope-tabs";

export const metadata = { title: "Inventory counts · CartLedger" };
export const dynamic = "force-dynamic";

export default async function InventoryCountsPage({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const { truck } = await searchParams;
  const api = await serverApi();
  const trucks = await api.truck.list();
  const truckId = trucks.some((t) => t.id === truck) ? truck : undefined;
  const [counts, actual] = await Promise.all([
    api.inventory.listCounts({ truckId }),
    api.ops.actualCogs({ truckId }),
  ]);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Inventory counts
          </h1>
          <p className="text-sm text-muted-foreground">
            Periodic snapshots — two counts give your true food cost.
          </p>
        </div>
        <Link
          href={`/inventory/counts/new${truckId ? `?truck=${truckId}` : ""}`}
          className={buttonVariants({ size: "sm" })}
        >
          Take a count
        </Link>
      </div>

      <TruckScopeTabs
        basePath="/inventory/counts"
        trucks={trucks}
        selectedTruckId={truckId}
      />

      {/* Actual food cost (#3) — always shown so it's discoverable, with a
          clear reason when it can't be computed yet. */}
      <Card>
        <CardContent className="p-5">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            Actual food cost
            {actual.available
              ? ` · ${fmtDate(actual.periodStart)} – ${fmtDate(actual.periodEnd)}`
              : ""}
          </p>
          {actual.available ? (
            <>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {fmtMoneyCents(actual.cogsCents)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Opening {fmtMoneyCents(actual.openingValueCents)} + purchases{" "}
                {fmtMoneyCents(actual.purchasesCents)} − closing{" "}
                {fmtMoneyCents(actual.closingValueCents)}. This is the true
                figure — it includes waste &amp; shrink.
              </p>
            </>
          ) : (
            <p className="mt-1 text-sm text-muted-foreground">
              {actual.reason === "select_truck"
                ? "Pick a single truck above to see its actual food cost."
                : "Take 2 counts for this truck and we'll compute actual food cost = opening inventory + purchases received − closing inventory (the gap vs. theoretical usage is your shrink)."}
            </p>
          )}
        </CardContent>
      </Card>

      {counts.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No counts yet</CardTitle>
            <CardDescription>
              Take a count to snapshot your inventory value. After a second
              count, we compute actual food cost = opening + purchases − closing.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y">
            {counts.map((c) => (
              <Link
                key={c.id}
                href={`/inventory/counts/${c.id}`}
                className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{fmtDate(c.countedOn)}</p>
                  {c.note && (
                    <p className="truncate text-xs text-muted-foreground">
                      {c.note}
                    </p>
                  )}
                </div>
                <p className="shrink-0 font-medium tabular-nums">
                  {fmtMoneyCents(c.totalValueCents)}
                </p>
              </Link>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
