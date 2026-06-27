import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { Card } from "@/components/ui/card";
import { fmtMoneyCents, fmtDate } from "@/lib/format";

export const dynamic = "force-dynamic";

export default async function InventoryCountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let count;
  try {
    count = await api.inventory.countById({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">
          Count · {fmtDate(count.countedOn)}
        </h1>
        <p className="text-sm text-muted-foreground">
          Total value {fmtMoneyCents(count.totalValueCents)}
          {count.note ? ` · ${count.note}` : ""}
        </p>
      </div>

      <Card className="overflow-hidden p-0">
        <div className="divide-y">
          {count.lines.map((l) => (
            <div
              key={l.id}
              className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm"
            >
              <span className="min-w-0 truncate font-medium">
                {l.ingredientName}
              </span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
                {l.countedQty} {l.unit} · {fmtMoneyCents(l.unitCostCents)} ·{" "}
                <span className="font-medium text-foreground">
                  {fmtMoneyCents(Math.round(l.countedQty * l.unitCostCents))}
                </span>
              </span>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
