import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { ModificationForm } from "@/components/features/modification-form";
import { ArchiveButton } from "@/components/features/archive-button";

export const dynamic = "force-dynamic";

export default async function ModificationDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let modification;
  try {
    modification = await api.modification.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {modification.description}
          {modification.archivedAt && (
            <span className="ml-2 text-sm text-muted-foreground">
              (archived)
            </span>
          )}
        </h1>
        {!modification.archivedAt && (
          <ArchiveButton
            kind="modification"
            id={modification.id}
            redirectTo="/modifications"
          />
        )}
      </div>
      <ModificationForm modification={modification} />
    </div>
  );
}
