import { IngredientForm } from "@/components/features/ingredient-form";

export const metadata = { title: "Add ingredient · VendGuard" };

export default function NewIngredientPage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add ingredient</h1>
      <IngredientForm />
    </div>
  );
}
