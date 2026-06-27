import { RecipeForm } from "@/components/features/recipe-form";

export const metadata = { title: "Add menu item · VendGuard" };

export default async function NewRecipePage({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const { truck } = await searchParams;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add menu item</h1>
      <RecipeForm defaultTruckId={truck} />
    </div>
  );
}
