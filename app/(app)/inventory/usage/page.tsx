import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtMoneyCents } from "@/lib/format";
import { TruckScopeTabs } from "@/components/features/truck-scope-tabs";
import { RecomputeUsageButton } from "@/components/features/recompute-usage-button";

export const metadata = { title: "Inventory usage · CartLedger" };
export const dynamic = "force-dynamic";

export default async function InventoryUsagePage({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const { truck } = await searchParams;
  const api = await serverApi();
  const trucks = await api.truck.list();
  const truckId = trucks.some((t) => t.id === truck) ? truck : undefined;
  const usage = await api.inventory.usage({ days: 30, truckId });

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">
            Inventory usage
          </h1>
          <p className="max-w-xl text-sm text-muted-foreground">
            Theoretical ingredient usage from Square sales × recipes (last 30
            days). Auto-deducts from on-hand on each sync — or hit Recompute
            after adding/editing recipes.
          </p>
        </div>
        <RecomputeUsageButton />
      </div>

      <TruckScopeTabs
        basePath="/inventory/usage"
        trucks={trucks}
        selectedTruckId={truckId}
      />

      {usage.items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No usage tracked yet</CardTitle>
            <CardDescription>
              Usage appears once you (1) have Square sales and (2) have recipes
              whose names match your Square menu items.{" "}
              <strong>
                If you added recipes after your last sync, click “Recompute
                usage” above
              </strong>{" "}
              — it deducts now without re-pulling Square. (Items rung up as typed
              dollar amounts have no line item and can&apos;t be tracked.)
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="flex items-baseline justify-between p-5">
              <div>
                <p className="text-xl font-semibold tabular-nums">
                  {fmtMoneyCents(usage.totalCostCents)}
                </p>
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                  Theoretical food cost · last {usage.days} days
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Ingredient</th>
                    <th className="px-4 py-3 text-right font-medium">Used</th>
                    <th className="px-4 py-3 text-right font-medium">Cost</th>
                  </tr>
                </thead>
                <tbody>
                  {usage.items.map((i) => (
                    <tr key={i.ingredientId} className="border-b last:border-0">
                      <td className="px-4 py-3 font-medium">{i.name}</td>
                      <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                        {i.qtyUsed.toLocaleString("en-US", {
                          maximumFractionDigits: 2,
                        })}{" "}
                        {i.unit}
                      </td>
                      <td className="px-4 py-3 text-right font-medium tabular-nums">
                        {fmtMoneyCents(i.costCents)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <p className="text-xs text-muted-foreground">
            Theoretical = what recipes say you used. Real usage includes
            waste/spills — take an{" "}
            <Link
              href="/inventory/counts"
              className="text-brand-ink hover:underline"
            >
              inventory count
            </Link>{" "}
            to reconcile; the gap is your shrink/variance.
          </p>
        </>
      )}
    </div>
  );
}
