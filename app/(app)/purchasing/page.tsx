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
import { GenerateFromLowStock } from "@/components/features/purchasing-actions";
import { fmtMoneyCents, fmtDate } from "@/lib/format";
import type { PurchaseOrderStatus } from "@/lib/db/schema";

export const metadata = { title: "Purchasing · VendGuard" };
export const dynamic = "force-dynamic";

const STATUS: Record<
  PurchaseOrderStatus,
  { label: string; variant: "green" | "yellow" | "outline" }
> = {
  draft: { label: "Draft", variant: "outline" },
  ordered: { label: "Ordered", variant: "yellow" },
  received: { label: "Received", variant: "green" },
  canceled: { label: "Canceled", variant: "outline" },
};

export default async function PurchasingPage() {
  const api = await serverApi();
  const orders = await api.purchasing.list();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Purchasing</h1>
          <p className="text-sm text-muted-foreground">
            Build reorder lists, send them to suppliers, and receive stock.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <GenerateFromLowStock />
          <Link
            href="/purchasing/new"
            className={buttonVariants({ size: "sm" })}
          >
            New order
          </Link>
        </div>
      </div>

      {orders.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No purchase orders yet</CardTitle>
            <CardDescription>
              Create an order by hand, or “Generate from low stock” to seed one
              from every ingredient below its reorder point. Receiving an order
              adds its quantities back to inventory.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y">
            {orders.map((o) => {
              const s = STATUS[o.status];
              return (
                <Link
                  key={o.id}
                  href={`/purchasing/${o.id}`}
                  className="flex items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="min-w-0">
                    <p className="flex items-center gap-2 truncate font-medium">
                      {o.supplierName || "Untitled order"}
                      <Badge variant={s.variant}>{s.label}</Badge>
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      {o.itemCount} item{o.itemCount === 1 ? "" : "s"} ·{" "}
                      {fmtDate(o.createdAt)}
                    </p>
                  </div>
                  <p className="shrink-0 font-medium tabular-nums">
                    {fmtMoneyCents(o.totalCents)}
                  </p>
                </Link>
              );
            })}
          </div>
        </Card>
      )}
    </div>
  );
}
