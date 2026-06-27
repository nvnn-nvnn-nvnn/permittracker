import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { PurchaseOrderForm } from "@/components/features/purchase-order-form";
import { PurchaseOrderStatusActions } from "@/components/features/purchasing-actions";
import { ArchiveButton } from "@/components/features/archive-button";
import { fmtMoneyCents, fmtDate } from "@/lib/format";
import type { PurchaseOrderStatus } from "@/lib/db/schema";

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

export default async function PurchaseOrderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let order;
  try {
    order = await api.purchasing.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  const s = STATUS[order.status];
  const editable = order.status !== "received";

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
            {order.supplierName || "Untitled order"}
            <Badge variant={s.variant}>{s.label}</Badge>
          </h1>
          <p className="text-sm text-muted-foreground">
            {order.lines.length} item{order.lines.length === 1 ? "" : "s"} ·
            total {fmtMoneyCents(order.totalCents)}
            {order.receivedAt
              ? ` · received ${fmtDate(order.receivedAt)}`
              : order.orderedAt
                ? ` · ordered ${fmtDate(order.orderedAt)}`
                : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PurchaseOrderStatusActions id={order.id} status={order.status} />
          {!order.archivedAt && (
            <ArchiveButton
              kind="purchaseOrder"
              id={order.id}
              redirectTo="/purchasing"
            />
          )}
        </div>
      </div>

      {order.status === "received" && (
        <p className="rounded-md bg-status-green/10 px-3 py-2 text-sm text-foreground">
          This order was received — its quantities were added to inventory. It
          can no longer be edited.
        </p>
      )}

      {editable ? (
        <PurchaseOrderForm
          order={{
            id: order.id,
            supplierName: order.supplierName,
            notes: order.notes,
            lines: order.lines.map((l) => ({
              ingredientId: l.ingredientId,
              qty: l.qty,
              unitCostCents: l.unitCostCents,
            })),
          }}
        />
      ) : (
        <Card className="overflow-hidden p-0">
          <div className="divide-y">
            {order.lines.map((l) => (
              <div
                key={l.id}
                className="flex items-center justify-between gap-3 px-4 py-3"
              >
                <span className="min-w-0 truncate font-medium">
                  {l.ingredientName}
                </span>
                <span className="shrink-0 text-sm text-muted-foreground">
                  {l.qty} {l.unit} · {fmtMoneyCents(l.unitCostCents)} ·{" "}
                  <span className="font-medium text-foreground tabular-nums">
                    {fmtMoneyCents(l.lineCostCents)}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
