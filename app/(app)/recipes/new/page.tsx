import { RecipeForm } from "@/components/features/recipe-form";

export const metadata = { title: "Add menu item · VendGuard" };

export default function NewRecipePage() {
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">Add menu item</h1>
      <RecipeForm />
    </div>
  );
}
