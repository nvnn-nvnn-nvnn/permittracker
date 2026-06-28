import Link from "next/link";
import { serverApi } from "@/lib/trpc/server";
import { buttonVariants } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ItemsChecklist } from "@/components/features/items-checklist";
import { ItemsByType } from "@/components/features/items-by-type";

export const metadata = { title: "Compliance items · CartLedger" };
export const dynamic = "force-dynamic";

export default async function ItemsPage() {
  const api = await serverApi();
  const [items, trucks] = await Promise.all([
    api.item.list(),
    api.truck.list({ includeArchived: true }),
  ]);
  const truckName = new Map(trucks.map((t) => [t.id, t.name]));

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Compliance items
        </h1>
        <Link href="/items/new" className={buttonVariants({ size: "sm" })}>
          Add item
        </Link>
      </div>

      <ItemsChecklist items={items} />

      {items.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No items yet</CardTitle>
            <CardDescription>
              Add a permit, inspection, cert, or COI to start tracking expiry.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <ItemsByType items={items} truckName={truckName} />
      )}
    </div>
  );
}
