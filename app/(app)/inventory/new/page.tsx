import { IngredientForm } from "@/components/features/ingredient-form";

export const metadata = { title: "Add ingredient · CartLedger" };

export default async function NewIngredientPage({
  searchParams,
}: {
  searchParams: Promise<{ truck?: string }>;
}) {
  const { truck } = await searchParams;
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add ingredient</h1>
      <IngredientForm defaultTruckId={truck} />
    </div>
  );
}
