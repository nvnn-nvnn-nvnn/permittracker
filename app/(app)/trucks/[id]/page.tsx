import { notFound } from "next/navigation";
import Link from "next/link";
import { TRPCError } from "@trpc/server";
import { requireAccountContext } from "@/lib/auth/session";
import { serverApi } from "@/lib/trpc/server";
import { computeAccountStatus } from "@/lib/status";
import { TruckForm } from "@/components/features/truck-form";
import { TruckItems } from "@/components/features/truck-items";
import { TruckStaffItems } from "@/components/features/truck-staff-items";
import { ArchiveButton } from "@/components/features/archive-button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

const STATUS_LABEL = {
  red: "Action required",
  yellow: "Attention soon",
  green: "All clear",
} as const;

export default async function TruckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [ctx, api] = await Promise.all([
    requireAccountContext(),
    serverApi(),
  ]);

  let truck;
  let commissaries;
  let status;
  let staffRows;
  try {
    [truck, commissaries, status, staffRows] = await Promise.all([
      api.truck.byId({ id }),
      api.commissary.list(),
      computeAccountStatus(ctx.accountId),
      api.truck.staffItems({ truckId: id }),
    ]);
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  // This truck's own items (cascade-aware urgency from the status engine).
  const truckItems = status.items.filter(
    (u) => u.item.holderTruckId === id,
  );
  const reds = truckItems.filter(
    (u) => u.contributesRed || u.isExpired,
  ).length;
  const yellows = truckItems.filter(
    (u) => !(u.contributesRed || u.isExpired) && (u.expiringSoon || u.feeDueSoon),
  ).length;
  const sev: "red" | "yellow" | "green" =
    reds > 0 ? "red" : yellows > 0 ? "yellow" : "green";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex items-center gap-2.5">
            <h1 className="truncate text-2xl font-semibold tracking-tight">
              {truck.name}
            </h1>
            <Badge variant={sev}>{STATUS_LABEL[sev]}</Badge>
            {truck.archivedAt && (
              <span className="text-sm text-muted-foreground">(archived)</span>
            )}
          </div>
          <p className="text-sm text-muted-foreground">
            {truck.isActive ? "Active" : "Inactive"}
            {truck.jurisdiction ? ` · ${truck.jurisdiction}` : ""}
            {truck.plateOrVin ? ` · ${truck.plateOrVin}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href={`/items/new?truck=${truck.id}`}
            className={buttonVariants({ size: "sm" })}
          >
            Add item
          </Link>
          {!truck.archivedAt && (
            <ArchiveButton kind="truck" id={truck.id} redirectTo="/trucks" />
          )}
        </div>
      </div>

      {/* Compliance items, by type */}
      <section className="space-y-4">
        <div className="flex items-end justify-between gap-3">
          <h2 className="text-xl font-bold tracking-tight">
            Compliance items
          </h2>
          <span className="text-sm font-medium text-muted-foreground tabular-nums">
            {truckItems.length} total
            {reds > 0 && ` · ${reds} critical`}
            {yellows > 0 && ` · ${yellows} warning`}
          </span>
        </div>
        <TruckItems items={truckItems} truckId={truck.id} />
      </section>

      {/* Staff certifications that cascade onto this truck */}
      <TruckStaffItems rows={staffRows} />

      {/* Truck details (edit) — secondary, below the compliance picture */}
      <Card>
        <CardContent className="p-0">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <span className="text-sm font-medium">Truck details</span>
              <span className="text-xs text-muted-foreground group-open:hidden">
                Edit
              </span>
              <span className="hidden text-xs text-muted-foreground group-open:inline">
                Hide
              </span>
            </summary>
            <div className="border-t px-5 py-5">
              <TruckForm
                truck={truck}
                commissaries={commissaries.map((c) => ({
                  id: c.id,
                  name: c.name,
                }))}
              />
            </div>
          </details>
        </CardContent>
      </Card>
    </div>
  );
}
