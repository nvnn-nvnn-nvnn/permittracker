import { notFound } from "next/navigation";
import Link from "next/link";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { TruckForm } from "@/components/features/truck-form";
import { ArchiveButton } from "@/components/features/archive-button";
import { buttonVariants } from "@/components/ui/button";

export const dynamic = "force-dynamic";

export default async function TruckDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let truck;
  try {
    truck = await api.truck.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const commissaries = await api.commissary.list();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {truck.name}
          {truck.archivedAt && (
            <span className="ml-2 text-sm text-muted-foreground">
              (archived)
            </span>
          )}
        </h1>
        <div className="flex items-center gap-2">
          <Link
            href={`/items/new?truck=${truck.id}`}
            className={buttonVariants({ size: "sm", variant: "outline" })}
          >
            Add item
          </Link>
          {!truck.archivedAt && (
            <ArchiveButton kind="truck" id={truck.id} redirectTo="/trucks" />
          )}
        </div>
      </div>
      <TruckForm
        truck={truck}
        commissaries={commissaries.map((c) => ({
          id: c.id,
          name: c.name,
        }))}
      />
    </div>
  );
}
