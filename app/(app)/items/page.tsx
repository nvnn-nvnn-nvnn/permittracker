import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { classifyItem } from "@/lib/status";
import { fmtDate } from "@/lib/format";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export const metadata = { title: "Compliance items · PermitKeep" };
export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const api = await serverApi();
  const [items, trucks] = await Promise.all([
    api.item.list(),
    api.truck.list({ includeArchived: true }),
  ]);
  const truckName = new Map(trucks.map((t) => [t.id, t.name]));

  // Sort by urgency: soonest / most overdue first.
  const sorted = [...items].sort((a, b) => {
    const da =
      classifyItem(a).daysToExpiry ?? Number.MAX_SAFE_INTEGER;
    const db =
      classifyItem(b).daysToExpiry ?? Number.MAX_SAFE_INTEGER;
    return da - db;
  });

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">
          Compliance items
        </h1>
        <Link href="/items/new" className={buttonVariants({ size: "sm" })}>
          Add item
        </Link>
      </div>

      {sorted.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No items yet</CardTitle>
            <CardDescription>
              Add a permit, inspection, cert, or COI to start tracking expiry.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="grid gap-3">
          {sorted.map((it) => {
            const badge = classifyItem(it);
            return (
              <Link key={it.id} href={`/items/${it.id}`}>
                <Card className="transition-colors hover:bg-accent/40">
                  <CardContent className="flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        <span className="uppercase text-muted-foreground">
                          {it.itemType}
                        </span>{" "}
                        {it.subtype ?? it.identifier ?? ""}
                      </p>
                      <p className="truncate text-sm text-muted-foreground">
                        {it.holderTruckId
                          ? (truckName.get(it.holderTruckId) ?? "truck")
                          : (it.holderName ?? it.holderType)}{" "}
                        · exp {fmtDate(it.expirationDate)}
                      </p>
                    </div>
                    <Badge variant={badge.variant}>{badge.label}</Badge>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
