import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { PersonForm } from "@/components/features/person-form";
import { ArchiveButton } from "@/components/features/archive-button";

export const dynamic = "force-dynamic";

export default async function PersonDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let person;
  try {
    person = await api.person.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }
  const trucks = await api.truck.list();

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {person.name}
          {person.archivedAt && (
            <span className="ml-2 text-sm text-muted-foreground">
              (archived)
            </span>
          )}
        </h1>
        {!person.archivedAt && (
          <ArchiveButton kind="person" id={person.id} redirectTo="/people" />
        )}
      </div>
      <PersonForm
        person={person}
        initialTruckIds={person.truckIds}
        trucks={trucks.map((t) => ({ id: t.id, name: t.name }))}
      />
    </div>
  );
}
