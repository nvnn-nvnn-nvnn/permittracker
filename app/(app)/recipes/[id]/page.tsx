import { notFound } from "next/navigation";
import { TRPCError } from "@trpc/server";
import { serverApi } from "@/lib/trpc/server";
import { RecipeForm } from "@/components/features/recipe-form";
import { ArchiveButton } from "@/components/features/archive-button";

export const dynamic = "force-dynamic";

export default async function RecipeDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const api = await serverApi();
  let recipe;
  try {
    recipe = await api.recipe.byId({ id });
  } catch (e) {
    if (e instanceof TRPCError && e.code === "NOT_FOUND") notFound();
    throw e;
  }

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between gap-3">
        <h1 className="truncate text-2xl font-semibold tracking-tight">
          {recipe.name}
          {recipe.archivedAt && (
            <span className="ml-2 text-sm text-muted-foreground">
              (archived)
            </span>
          )}
        </h1>
        {!recipe.archivedAt && (
          <ArchiveButton kind="recipe" id={recipe.id} redirectTo="/recipes" />
        )}
      </div>
      <RecipeForm
        recipe={{
          id: recipe.id,
          truckId: recipe.truckId,
          name: recipe.name,
          category: recipe.category,
          sellPriceCents: recipe.sellPriceCents,
          notes: recipe.notes,
          lines: recipe.lines.map((l) => ({
            ingredientId: l.ingredientId,
            qty: l.qty,
          })),
        }}
      />
    </div>
  );
}
