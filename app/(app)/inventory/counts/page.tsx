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

export const metadata = { title: "Inventory counts · VendGuard" };
export const dynamic = "force-dynamic";

export default async function InventoryCountsPage() {
  const api = await serverApi();
  const [counts, actual] = await Promise.all([
    api.inventory.listCounts(),
    api.ops.actualCogs(),
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
          href="/inventory/counts/new"
          className={buttonVariants({ size: "sm" })}
        >
          Take a count
        </Link>
      </div>

      {actual.available && (
        <Card>
          <CardContent className="p-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Actual food cost · {fmtDate(actual.periodStart)} –{" "}
              {fmtDate(actual.periodEnd)}
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {fmtMoneyCents(actual.cogsCents)}
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Opening {fmtMoneyCents(actual.openingValueCents)} + purchases{" "}
              {fmtMoneyCents(actual.purchasesCents)} − closing{" "}
              {fmtMoneyCents(actual.closingValueCents)}. Includes waste/shrink.
            </p>
          </CardContent>
        </Card>
      )}

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
