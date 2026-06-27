import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { IngredientForm } from "@/components/features/ingredient-form";
import { ArchiveButton } from "@/components/features/archive-button";

export const dynamic = "force-dynamic";

export default async function IngredientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let ingredient;
  try {
    ingredient = await api.inventory.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {ingredient.name}
          {ingredient.archivedAt && (
            <span className="ml-2 text-sm text-muted-foreground">
              (archived)
            </span>
          )}
        </h1>
        {!ingredient.archivedAt && (
          <ArchiveButton
            kind="ingredient"
            id={ingredient.id}
            redirectTo="/inventory"
          />
        )}
      </div>
      <IngredientForm ingredient={ingredient} />
    </div>
  );
}
