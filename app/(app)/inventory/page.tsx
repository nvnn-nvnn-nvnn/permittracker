import Link from "next/link";
import { AlertTriangle, Activity, ClipboardList } from "lucide-react";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { fmtMoneyCents } from "@/lib/format";
import { TruckScopeTabs } from "@/components/features/truck-scope-tabs";
import { FoodCostExplainer } from "@/components/features/food-cost-explainer";

export const metadata = { title: "Inventory · CartLedger" };
export const dynamic = "force-dynamic";

function isLow(i: { parLevel: number | null; onHandQty: number }): boolean {
  return i.parLevel !== null && i.onHandQty <= i.parLevel;
}

export default async function InventoryPage({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const { truck } = await searchParams;
  const api = await serverApi();
  const trucks = await api.truck.list();
  const truckId = trucks.some((t) => t.id === truck) ? truck : undefined;
  const truckQs = truckId ? `?truck=${truckId}` : "";
  const [items, summary] = await Promise.all([
    api.inventory.list({ truckId }),
    api.inventory.summary({ truckId }),
  ]);

  const tiles = [
    { label: "Ingredients", value: summary.count.toLocaleString("en-US") },
    { label: "Inventory value", value: fmtMoneyCents(summary.valueCents) },
    {
      label: "Low stock",
      value: summary.lowStock.toLocaleString("en-US"),
      tone: summary.lowStock > 0 ? "text-status-yellow" : "text-foreground",
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Inventory</h1>
          <p className="text-sm text-muted-foreground">
            What you stock, what it costs, and what&apos;s running low. On-hand
            auto-updates from Square sales when items match a{" "}
            <Link href="/recipes" className="text-brand-ink hover:underline">
              recipe
            </Link>
            .
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/inventory/usage${truckQs}`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <Activity /> Usage &amp; cost
          </Link>
          <Link
            href={`/inventory/counts${truckQs}`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            <ClipboardList /> Counts
          </Link>
          <Link
            href={`/inventory/new${truckQs}`}
            className={buttonVariants({ size: "sm" })}
          >
            Add ingredient
          </Link>
        </div>
      </div>

      <TruckScopeTabs
        basePath="/inventory"
        trucks={trucks}
        selectedTruckId={truckId}
      />

      <FoodCostExplainer />

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No ingredients yet</CardTitle>
            <CardDescription>
              Add what you buy and stock — set a reorder point (par) and
              we&apos;ll flag low stock before you run out.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <>
          <Card>
            <CardContent className="grid grid-cols-3 gap-4 p-5">
              {tiles.map((t) => (
                <div key={t.label}>
                  <p
                    className={`text-xl font-semibold tabular-nums ${
                      t.tone ?? "text-foreground"
                    }`}
                  >
                    {t.value}
                  </p>
                  <p className="text-[11px] uppercase tracking-wide text-muted-foreground">
                    {t.label}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="overflow-hidden p-0">
            <div className="divide-y">
              {items.map((i) => {
                const low = isLow(i);
                return (
                  <Link
                    key={i.id}
                    href={`/inventory/${i.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                  >
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-medium">
                        {i.name}
                        {low && (
                          <Badge variant="yellow" className="gap-1">
                            <AlertTriangle className="size-3" /> Low
                          </Badge>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {i.category ? `${i.category} · ` : ""}
                        {fmtMoneyCents(i.unitCostCents)}/{i.unit}
                        {i.supplierName ? ` · ${i.supplierName}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-medium tabular-nums">
                        {i.onHandQty} {i.unit}
                      </p>
                      {i.parLevel !== null && (
                        <p className="text-[11px] text-muted-foreground">
                          par {i.parLevel}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
