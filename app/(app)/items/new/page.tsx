import { serverApi } from "@/lib/trpc/server";
import { ItemForm } from "@/components/features/item-form";

export const metadata = { title: "Add item · PermitKeep" };
export const dynamic = "force-dynamic";

export default async function NewItemPage() {
  const api = await serverApi();
  const [trucks, items, people, venues] = await Promise.all([
    api.truck.list(),
    api.item.list(),
    api.person.list(),
    api.venue.list(),
  ]);
  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-semibold tracking-tight">
        Add compliance item
      </h1>
      <ItemForm
        trucks={trucks.map((t) => ({ id: t.id, name: t.name }))}
        parentOptions={items.map((i) => ({
          id: i.id,
          label: `${i.itemType} — ${i.subtype ?? i.identifier ?? "item"}`,
        }))}
        people={people.map((p) => ({ id: p.id, name: p.name }))}
        venues={venues.map((v) => ({ id: v.id, name: v.name }))}
      />
    </div>
  );
}
