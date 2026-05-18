import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { CommissaryForm } from "@/components/features/commissary-form";
import { ArchiveButton } from "@/components/features/archive-button";

export const dynamic = "force-dynamic";

export default async function CommissaryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let commissary;
  try {
    commissary = await api.commissary.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {commissary.name}
          {commissary.archivedAt && (
            <span className="ml-2 text-sm text-muted-foreground">
              (archived)
            </span>
          )}
        </h1>
        {!commissary.archivedAt && (
          <ArchiveButton
            kind="commissary"
            id={commissary.id}
            redirectTo="/commissaries"
          />
        )}
      </div>
      <CommissaryForm commissary={commissary} />
    </div>
  );
}
