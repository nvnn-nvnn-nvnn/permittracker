import { serverApi } from "@/lib/trpc/server";
import { ItemForm } from "@/components/features/item-form";

export const metadata = { title: "Add item · PermitKeep" };
export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const api = await serverApi();
  const trucks = await api.truck.list();
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">
        Add compliance item
      </h1>
      <ItemForm trucks={trucks.map((t) => ({ id: t.id, name: t.name }))} />
    </div>
  );
}
